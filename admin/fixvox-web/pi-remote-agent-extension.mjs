import { Type } from 'typebox'
import { registerRemoteAgentPolicy } from './pi-remote-agent-core.mjs'

export default function remoteAgentPolicy(pi) {
  registerRemoteAgentPolicy(pi, {
    futureAppointmentsParameters: Type.Object({
      days: Type.Optional(Type.Integer({ minimum: 1, maximum: 120, description: 'Horizonte en días; default 60.' })),
    }),
  })
}
