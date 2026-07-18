import { Type } from 'typebox'
import { createBashTool, createEditTool, createReadTool, createWriteTool } from '@earendil-works/pi-coding-agent'
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
  ]) pi.registerTool(tool)

  registerRemoteAgentPolicy(pi, {
    futureAppointmentsParameters: Type.Object({
      days: Type.Optional(Type.Integer({ minimum: 1, maximum: 120, description: 'Horizonte en días; default 60.' })),
    }),
  })
}
