export type Command = { kind: 'labels' | 'letterhead'; number: string; quantity: number }
export type Candidate = { id: number; number: string; kind: string; name: string }
export type JobResult = Command & { ok: boolean; message: string }
export type PrismaAgentStatus = { slug: string; name: string; enabled: boolean; available: boolean; configured: boolean; provider: string; model: string; reason: string | null }
export type PrismaResult = {
  ok: boolean; error?: string; message?: string; agent?: PrismaAgentStatus
  status?: 'interpreted' | 'choose' | 'completed' | 'stopped' | 'cancelled' | 'available' | 'unavailable'
  commands?: Command[]; requires_confirmation?: boolean; plan_token?: string; expires_at?: number
  candidates?: Candidate[]; number?: string; results?: JobResult[]; remaining?: number
}
declare global {
  interface Window {
    ivoolvePrisma?: {
      status: (value: { token: string }) => Promise<PrismaResult>
      interpret: (value: { token: string; text: string; history: string[] }) => Promise<PrismaResult>
      execute: (value: { token: string; plan_token: string; confirmed: boolean }) => Promise<PrismaResult>
      choose: (value: { token: string; dispatchId: number }) => Promise<PrismaResult>
      cancel: () => Promise<PrismaResult>
    }
  }
}
function bridge() {
  if (!window.ivoolvePrisma) throw Error('Actualiza y reinicia Electron para utilizar Prisma. Los buscadores manuales siguen disponibles.')
  return window.ivoolvePrisma
}
export const prismaService = {
  status: (token: string) => bridge().status({ token }),
  interpret: (token: string, text: string, history: string[]) => bridge().interpret({ token, text, history }),
  execute: (token: string, plan: PrismaResult, confirmed: boolean) => {
    if (!plan.plan_token || !plan.expires_at || plan.expires_at * 1000 <= Date.now()) throw Error('La solicitud venció. Escríbela nuevamente.')
    return bridge().execute({ token, plan_token: plan.plan_token, confirmed })
  },
  choose: (token: string, dispatchId: number) => bridge().choose({ token, dispatchId }),
  cancel: () => bridge().cancel(),
}
