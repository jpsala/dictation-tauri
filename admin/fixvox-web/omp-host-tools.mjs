import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { queryFutureAppointments } from './constelaciones-read-adapter.mjs'
import { createReleaseBrokerClient } from './omp-release-broker-client.mjs'
import { createBrokerOperations } from './omp-workspace-broker-client.mjs'
import { auditRecord, classifyRemoteToolCall, resolveRemoteToolInput } from './omp-remote-policy.mjs'

const CONFIRM_TIMEOUT_MS = 60_000
const objectSchema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })
const string = (description, options = {}) => ({ type: 'string', description, ...options })
const integer = (description, options = {}) => ({ type: 'integer', description, ...options })
const boolean = (description) => ({ type: 'boolean', description })
const textResult = (text, details) => ({ content: [{ type: 'text', text: String(text ?? '') }], ...(details === undefined ? {} : { details }) })

function toolDefinitions(releaseBrokerEnabled) {
  const tools = [
    { name: 'read', label: 'Leer archivo', description: 'Lee texto dentro de los workspaces aprobados. Las rutas sensibles están bloqueadas.', parameters: objectSchema({ path: string('Ruta de archivo.'), offset: integer('Línea inicial basada en 1.', { minimum: 1 }), limit: integer('Cantidad máxima de líneas.', { minimum: 1, maximum: 5000 }) }, ['path']) },
    { name: 'write', label: 'Escribir archivo', description: 'Reemplaza un archivo aprobado después de confirmación humana.', parameters: objectSchema({ path: string('Ruta de archivo.'), content: string('Contenido UTF-8 completo.') }, ['path', 'content']) },
    { name: 'edit', label: 'Editar archivo', description: 'Reemplaza una coincidencia textual exacta después de confirmación humana.', parameters: objectSchema({ path: string('Ruta de archivo.'), oldText: string('Texto exacto existente.'), newText: string('Texto de reemplazo.') }, ['path', 'oldText', 'newText']) },
    { name: 'bash', label: 'Ejecutar shell', description: 'Ejecuta un comando acotado mediante el broker después de confirmación. No permite secretos ni releases.', parameters: objectSchema({ command: string('Comando de shell.'), cwd: string('Directorio dentro de los roots aprobados.'), timeout: integer('Timeout en segundos.', { minimum: 1, maximum: 600 }) }, ['command']) },
    { name: 'grep', label: 'Buscar texto', description: 'Busca texto read-only dentro de los mirrors aprobados.', parameters: objectSchema({ pattern: string('Patrón de búsqueda.'), path: string('Archivo o directorio.'), glob: string('Filtro glob relativo.'), ignoreCase: boolean('Ignorar mayúsculas.'), literal: boolean('Tratar como texto literal.'), limit: integer('Máximo de coincidencias.', { minimum: 1, maximum: 200 }) }, ['pattern']) },
    { name: 'find', label: 'Buscar archivos', description: 'Enumera rutas por glob dentro de los workspaces aprobados.', parameters: objectSchema({ pattern: string('Patrón glob relativo.'), path: string('Directorio base.'), limit: integer('Máximo de rutas.', { minimum: 1, maximum: 500 }) }, ['pattern']) },
    { name: 'ls', label: 'Listar directorio', description: 'Lista un directorio dentro de los workspaces aprobados.', parameters: objectSchema({ path: string('Directorio.'), limit: integer('Máximo de entradas.', { minimum: 1, maximum: 500 }) }) },
    { name: 'constelaciones_future_appointments', label: 'Turnos futuros', description: 'Consulta read-only y redacted de turnos futuros confirmados. No devuelve nombres, teléfonos, IDs, notas ni pagos.', parameters: objectSchema({ days: integer('Horizonte en días; default 60.', { minimum: 1, maximum: 120 }) }) },
  ]
  if (!releaseBrokerEnabled) return tools
  return tools.concat([
    { name: 'release_git_status', label: 'Release status', description: 'Estado Git read-only y acotado desde el release broker.', parameters: objectSchema({ repoId: string('ID configurado del repositorio.') }, ['repoId']) },
    { name: 'release_git_diff', label: 'Release diff', description: 'Diff Git read-only y acotado desde el release broker.', parameters: objectSchema({ repoId: string('ID configurado del repositorio.') }, ['repoId']) },
    { name: 'release_git_commit', label: 'Release commit', description: 'Commit de paths configurados sólo después de confirmación. Nunca hace push.', parameters: objectSchema({ repoId: string('ID configurado.'), message: string('Mensaje de commit.', { minLength: 1, maxLength: 120 }) }, ['repoId', 'message']) },
    { name: 'release_git_push', label: 'Release push', description: 'Push mediante receta allowlisted y confirmación exacta.', parameters: objectSchema({ repoId: string('ID configurado.') }, ['repoId']) },
    { name: 'release_deploy', label: 'Release deploy', description: 'Deploy mediante receta allowlisted y confirmación exacta.', parameters: objectSchema({ repoId: string('ID configurado.'), recipeId: string('ID de receta.') }, ['repoId', 'recipeId']) },
  ])
}

export function createOmpHostTools(options) {
  const { auditPath, constelacionesSocket, cwd, releaseBrokerEnabled = false, releaseBrokerSocket, roots, workspaceBrokerSocket } = options
  const operations = createBrokerOperations(workspaceBrokerSocket)
  const release = releaseBrokerEnabled ? createReleaseBrokerClient(releaseBrokerSocket) : null
  const definitions = toolDefinitions(releaseBrokerEnabled)
  const enabled = new Set(definitions.map((tool) => tool.name))

  async function audit(toolName, classification, approved, sessionId) {
    if (!auditPath) throw new Error('Remote-agent audit path is not configured.')
    await mkdir(dirname(auditPath), { recursive: true })
    await appendFile(auditPath, `${JSON.stringify(auditRecord({ toolName, classification, approved, sessionId }))}\n`, { encoding: 'utf8', mode: 0o600 })
  }

  async function executeRelease(toolName, params, context) {
    if (!release) throw new Error('Release broker is not enabled.')
    if (toolName === 'release_git_status') {
      const result = await release.status(params.repoId, context.signal)
      return textResult(JSON.stringify(result), result)
    }
    if (toolName === 'release_git_diff') {
      const result = await release.diff(params.repoId, context.signal)
      return textResult(result.diff, { repoId: result.repoId })
    }
    const operation = toolName === 'release_git_commit' ? 'git_commit' : toolName === 'release_git_push' ? 'git_push' : 'deploy'
    const challenge = await release.prepare({ operation, ...params }, context.signal)
    await context.update(textResult('Esperando confirmación humana del release broker.'))
    if (operation === 'git_commit') {
      const response = await context.requestUi({ method: 'confirm', title: 'Autorizar commit', message: `${challenge.repoId}/${challenge.sourceHash.slice(0, 12)}\n${params.message}`, timeout: CONFIRM_TIMEOUT_MS }, context.signal)
      if (response?.confirmed !== true) throw new Error('Commit cancelado.')
      const result = await release.execute({ id: challenge.id, confirmation: challenge.phrase }, context.signal)
      return textResult(JSON.stringify(result), result)
    }
    const response = await context.requestUi({ method: 'input', title: 'Confirmación exacta requerida', message: `Escribí exactamente: ${challenge.phrase}`, timeout: CONFIRM_TIMEOUT_MS }, context.signal)
    if (response?.value !== challenge.phrase) throw new Error('Operación cancelada.')
    const result = await release.execute({ id: challenge.id, confirmation: response.value }, context.signal)
    return textResult(JSON.stringify(result), result)
  }

  async function executeWorkspace(toolName, params, context) {
    if (toolName === 'read') {
      const lines = (await operations.read.readFile(params.path, context.signal)).toString('utf8').split(/\r?\n/)
      const offset = Math.max(1, Number(params.offset) || 1)
      const limit = Math.max(1, Math.min(5000, Number(params.limit) || 500))
      return textResult(lines.slice(offset - 1, offset - 1 + limit).map((line, index) => `${offset + index}:${line}`).join('\n'))
    }
    if (toolName === 'write') {
      await operations.write.writeFile(params.path, params.content, context.signal)
      return textResult(`Wrote ${Buffer.byteLength(params.content, 'utf8')} bytes to ${params.path}.`)
    }
    if (toolName === 'edit') {
      const current = (await operations.edit.readFile(params.path, context.signal)).toString('utf8')
      const first = current.indexOf(params.oldText)
      if (first === -1) throw new Error('Exact edit text was not found.')
      if (current.indexOf(params.oldText, first + params.oldText.length) !== -1) throw new Error('Exact edit text is not unique.')
      await operations.edit.writeFile(params.path, `${current.slice(0, first)}${params.newText}${current.slice(first + params.oldText.length)}`, context.signal)
      return textResult(`Edited ${params.path}.`)
    }
    if (toolName === 'bash') {
      let output = Buffer.alloc(0)
      const result = await operations.bash.exec(params.command, params.cwd || cwd, { signal: context.signal, timeout: params.timeout, onData(chunk) { output = Buffer.concat([output, chunk]) } })
      await context.update(textResult(output.toString('utf8')))
      return textResult(output.toString('utf8') || `Command exited with code ${result.exitCode}.`, { exitCode: result.exitCode })
    }
    if (toolName === 'grep') {
      const matches = await operations.grep(params, context.signal)
      return textResult(matches.map((match) => `${match.path}:${match.line}: ${match.text}`).join('\n') || 'No matches found.', { count: matches.length })
    }
    if (toolName === 'find') {
      const paths = await operations.find.glob(params.pattern, params.path || cwd, { limit: params.limit }, context.signal)
      return textResult(paths.join('\n') || 'No paths found.', { count: paths.length })
    }
    if (toolName === 'ls') {
      const entries = await operations.ls.readdir(params.path || cwd, params.limit, context.signal)
      return textResult(entries.join('\n') || 'Directory is empty.', { count: entries.length })
    }
    if (toolName === 'constelaciones_future_appointments') {
      const result = await queryFutureAppointments({ socketPath: constelacionesSocket, days: params.days, signal: context.signal })
      return textResult(JSON.stringify(result), { source: result.source, count: result.count, partial: result.partial })
    }
    throw new Error(`Host tool ${toolName} has no executor.`)
  }

  return {
    definitions,
    systemPrompt: 'Remote-agent policy: work across approved VPS repositories. Never seek credentials or sensitive stores. Reads inside approved roots are allowed. Writes, edits and shell operations require a pre-execution approval card. Git commit, push and deploy are available only through the dedicated release broker and its confirmation flow. A missing, cancelled or timed-out card means do not execute. Browser access to local Chrome is unavailable.',
    async execute(toolName, input, context) {
      if (!enabled.has(toolName)) throw new Error(`Host tool ${toolName} is not registered.`)
      const params = await resolveRemoteToolInput(toolName, input, cwd)
      const classification = classifyRemoteToolCall(toolName, params, { cwd, roots })
      if (classification.decision === 'deny') {
        await audit(toolName, classification, false, context.sessionId)
        throw new Error(classification.reason || 'Blocked by remote-agent policy.')
      }
      if (classification.decision === 'confirm') {
        const detail = classification.detail ? `\n\n${classification.detail}` : ''
        const response = await context.requestUi({ method: 'confirm', title: 'Autorizar operación remota', message: `${classification.summary || toolName}${detail}`, timeout: CONFIRM_TIMEOUT_MS }, context.signal)
        const approved = response?.confirmed === true
        await audit(toolName, classification, approved, context.sessionId)
        if (!approved) throw new Error('Operation cancelled or approval timed out.')
      } else {
        await audit(toolName, classification, undefined, context.sessionId)
      }
      return toolName.startsWith('release_') ? executeRelease(toolName, params, context) : executeWorkspace(toolName, params, context)
    },
  }
}
