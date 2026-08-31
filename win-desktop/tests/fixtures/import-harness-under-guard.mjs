import LocalSandbox from '@deepseek-ai/dsh-sandbox-local'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import ClientModuleRegistry from '@deepseek-ai/dsh-client-modules'
import { Config as AgentTeamsConfig } from '@nanmicoder/dsh-agent-teams'

if (typeof LocalSandbox !== 'function') throw new Error('sandbox-local export missing')
if (typeof LocalSubprocessRuntime !== 'function') throw new Error('subprocess-local export missing')
if (typeof ClientModuleRegistry !== 'function') throw new Error('client-modules export missing')
if (AgentTeamsConfig === undefined) throw new Error('agent-teams Config export missing')
process.stdout.write('loader-import-ok\n')
