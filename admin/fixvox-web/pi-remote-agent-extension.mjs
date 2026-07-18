import { Type } from 'typebox'
import { createBashTool, createEditTool, createFindTool, createLsTool, createReadTool, createWriteTool } from '@earendil-works/pi-coding-agent'
import { registerRemoteAgentPolicy } from './pi-remote-agent-core.mjs'
import { createReleaseBrokerClient } from './pi-release-broker-client.mjs'
import { createBrokerOperations } from './pi-workspace-broker-client.mjs'

export default function remoteAgentPolicy(pi) {
  const cwd = process.cwd()
  const operations = createBrokerOperations(process.env.PI_CHAT_WORKSPACE_BROKER_SOCKET)
  for (const tool of [
    createReadTool(cwd, { operations: operations.read }),
    createWriteTool(cwd, { operations: operations.write }),
    createEditTool(cwd, { operations: operations.edit }),
    createBashTool(cwd, { operations: operations.bash }),
    createFindTool(cwd, { operations: operations.find }),
    createLsTool(cwd, { operations: operations.ls }),
  ]) pi.registerTool(tool)

  pi.registerTool({
    name: 'grep',
    label: 'Buscar texto',
    description: 'Busca texto read-only dentro de los mirrors aprobados mediante el workspace broker.',
    parameters: Type.Object({
      pattern: Type.String(),
      path: Type.Optional(Type.String()),
      glob: Type.Optional(Type.String()),
      ignoreCase: Type.Optional(Type.Boolean()),
      literal: Type.Optional(Type.Boolean()),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
    }),
    async execute(_id, params, signal) {
      const matches = await operations.grep(params, signal)
      const text = matches.map((match) => `${match.path}:${match.line}: ${match.text}`).join('\n') || 'No matches found.'
      return { content: [{ type: 'text', text }], details: { count: matches.length } }
    },
  })

  if (process.env.PI_CHAT_RELEASE_BROKER_ENABLED === '1') {
    const release = createReleaseBrokerClient(process.env.PI_CHAT_RELEASE_BROKER_SOCKET)
    const repoParameters = { repoId: Type.String({ description: 'Configured repository ID.' }) }
    pi.registerTool({
      name: 'release_git_status', label: 'Release status', description: 'Read-only bounded Git release status from the dedicated release broker.', parameters: Type.Object(repoParameters),
      async execute(_id, params, signal) { const result = await release.status(params.repoId, signal); return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result } },
    })
    pi.registerTool({
      name: 'release_git_diff', label: 'Release diff', description: 'Read-only bounded Git diff from the dedicated release broker.', parameters: Type.Object(repoParameters),
      async execute(_id, params, signal) { const result = await release.diff(params.repoId, signal); return { content: [{ type: 'text', text: result.diff }], details: { repoId: result.repoId } } },
    })
    pi.registerTool({
      name: 'release_git_commit', label: 'Release commit', description: 'Commit configured paths after an exact owner confirmation. Never pushes.',
      parameters: Type.Object({ ...repoParameters, message: Type.String({ minLength: 1, maxLength: 120 }) }),
      async execute(_id, params, signal, _update, ctx) {
        const challenge = await release.prepare({ operation: 'git_commit', ...params }, signal)
        if (!ctx?.hasUI || !await ctx.ui.confirm('Autorizar commit', `${challenge.repoId}/${challenge.sourceHash.slice(0, 12)}\n${params.message}`, { timeout: 60_000 })) return { content: [{ type: 'text', text: 'Commit cancelado.' }] }
        const result = await release.execute({ id: challenge.id, confirmation: challenge.phrase }, signal)
        return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result }
      },
    })
    for (const operation of ['git_push', 'deploy']) {
      const name = operation === 'git_push' ? 'release_git_push' : 'release_deploy'
      pi.registerTool({
        name, label: operation === 'git_push' ? 'Release push' : 'Release deploy', description: 'High-risk typed release operation through an allowlisted broker recipe.',
        parameters: Type.Object({ ...repoParameters, ...(operation === 'deploy' ? { recipeId: Type.String() } : {}) }),
        async execute(_id, params, signal, _update, ctx) {
          const challenge = await release.prepare({ operation, ...params }, signal)
          if (!ctx?.hasUI) return { content: [{ type: 'text', text: 'Operación bloqueada: falta UI owner.' }] }
          const confirmation = await ctx.ui.input('Confirmación exacta requerida', `Escribí exactamente: ${challenge.phrase}`, { timeout: 60_000 })
          if (confirmation !== challenge.phrase) return { content: [{ type: 'text', text: 'Operación cancelada.' }] }
          const result = await release.execute({ id: challenge.id, confirmation }, signal)
          return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result }
        },
      })
    }
  }

  registerRemoteAgentPolicy(pi, {
    futureAppointmentsParameters: Type.Object({
      days: Type.Optional(Type.Integer({ minimum: 1, maximum: 120, description: 'Horizonte en días; default 60.' })),
    }),
  })
}
