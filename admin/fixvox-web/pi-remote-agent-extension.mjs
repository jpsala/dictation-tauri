import { Type } from 'typebox'
import { createBashTool, createEditTool, createFindTool, createLsTool, createReadTool, createWriteTool } from '@earendil-works/pi-coding-agent'
import { registerRemoteAgentPolicy } from './pi-remote-agent-core.mjs'
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

  registerRemoteAgentPolicy(pi, {
    futureAppointmentsParameters: Type.Object({
      days: Type.Optional(Type.Integer({ minimum: 1, maximum: 120, description: 'Horizonte en días; default 60.' })),
    }),
  })
}
