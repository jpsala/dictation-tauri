import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { queryFutureAppointments } from './constelaciones-read-adapter.mjs'
import {
  auditRecord,
  classifyRemoteToolCall,
  remoteAgentRoots,
  resolveRemoteToolInput,
} from './pi-remote-policy.mjs'

const CONFIRM_TIMEOUT_MS = 60_000

export function registerRemoteAgentPolicy(pi, options) {
  const roots = remoteAgentRoots(process.env.PI_CHAT_AGENT_ROOTS, process.cwd())
  const auditPath = process.env.PI_CHAT_AGENT_AUDIT_PATH

  async function audit(toolName, classification, approved, sessionId) {
    if (!auditPath) throw new Error('Remote-agent audit path is not configured.')
    const record = auditRecord({ toolName, classification, approved, sessionId })
    await mkdir(dirname(auditPath), { recursive: true })
    await appendFile(auditPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 })
  }

  pi.registerTool({
    name: 'constelaciones_future_appointments',
    label: 'Turnos futuros',
    description: 'Consulta read-only y redacted de turnos futuros confirmados mediante el broker explícito de Constelaciones. No devuelve nombres, teléfonos, IDs, notas ni pagos.',
    promptSnippet: 'Consultar turnos futuros de Constelaciones desde la fuente activa read-only',
    promptGuidelines: ['Use constelaciones_future_appointments para preguntas sobre turnos futuros; no busque SQLite, WhatsApp, stores ni archivos privados.'],
    parameters: options.futureAppointmentsParameters,
    async execute(_toolCallId, params, signal) {
      const result = await queryFutureAppointments({
        socketPath: process.env.PI_CHAT_CONSTELACIONES_SOCKET,
        days: params.days,
        signal,
      })
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { source: result.source, count: result.count, partial: result.partial } }
    },
  })

  pi.on('before_agent_start', (event) => ({
    systemPrompt: `${event.systemPrompt}\n\nRemote-agent policy: work across approved VPS repositories. Never seek credentials or sensitive stores. Reads inside approved roots are allowed. Writes, edits, shell, git, deploy and system operations require a pre-execution approval card. To request approval, call the intended tool normally: policy intercepts the call before execution and opens the card. Never ask for approval only in prose and never claim approval must exist before the tool call. A missing, cancelled or timed-out card means do not execute. Browser access to JP's local Chrome is unavailable.`,
  }))

  pi.on('tool_call', async (event, ctx) => {
    const policyInput = await resolveRemoteToolInput(event.toolName, event.input, ctx.cwd)
    if (policyInput.path && event.input && typeof event.input === 'object') event.input.path = policyInput.path
    const classification = classifyRemoteToolCall(event.toolName, policyInput, {
      cwd: ctx.cwd,
      roots,
    })
    const sessionId = ctx.sessionManager.getSessionId()

    if (classification.decision === 'allow') {
      await audit(event.toolName, classification, undefined, sessionId)
      return undefined
    }

    if (classification.decision === 'deny') {
      await audit(event.toolName, classification, false, sessionId)
      return { block: true, reason: classification.reason || 'Blocked by remote-agent policy.' }
    }

    if (!ctx.hasUI) {
      await audit(event.toolName, classification, false, sessionId)
      return { block: true, reason: 'Approval required, but no interactive UI is connected.' }
    }

    const detail = classification.detail ? `\n\n${classification.detail}` : ''
    const approved = await ctx.ui.confirm(
      'Autorizar operación remota',
      `${classification.summary || event.toolName}${detail}`,
      { timeout: CONFIRM_TIMEOUT_MS },
    )
    await audit(event.toolName, classification, approved, sessionId)
    if (!approved) return { block: true, reason: 'Operation cancelled or approval timed out.' }
    return undefined
  })
}
