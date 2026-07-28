// Metadados visuais por tipo de dispositivo — cor/ícone/rótulo. Análogo ao
// KIND_COLOR de dominios; NÃO sobrecarrega severity.ts (que é sobre severidade).
import {
  Server, Monitor, Router, Network, ShieldAlert, Printer, Video, Cpu,
  HardDrive, Phone, Smartphone, HelpCircle, Layers, type LucideIcon,
} from 'lucide-react'
import type { DeviceType } from '@/lib/api'

export const DEVICE_LABEL: Record<DeviceType, string> = {
  server: 'Servidor', workstation: 'Estação', hypervisor: 'Hypervisor', router: 'Roteador', switch: 'Switch',
  firewall: 'Firewall', printer: 'Impressora', camera: 'Câmera IP', iot: 'IoT',
  nas: 'NAS', voip: 'VoIP', mobile: 'Móvel', unknown: 'Desconhecido',
}

export const DEVICE_ICON: Record<DeviceType, LucideIcon> = {
  server: Server, workstation: Monitor, hypervisor: Layers, router: Router, switch: Network,
  firewall: ShieldAlert, printer: Printer, camera: Video, iot: Cpu,
  nas: HardDrive, voip: Phone, mobile: Smartphone, unknown: HelpCircle,
}

export const DEVICE_COLOR: Record<DeviceType, string> = {
  server: '#7C3AED',      // roxo (accent) — o coração da rede
  workstation: '#3B82F6', // azul
  hypervisor: '#22D3EE',  // ciano vivo — alvo de maior valor, destaca
  router: '#38BDF8',      // azul-céu
  switch: '#2DD4BF',      // teal
  firewall: '#F5892E',    // laranja
  printer: '#A78BFA',     // roxo claro
  camera: '#EC4899',      // rosa
  iot: '#EAB308',         // amarelo
  nas: '#14B8A6',         // teal escuro
  voip: '#8B5CF6',        // violeta
  mobile: '#60A5FA',      // azul claro
  unknown: '#71768C',     // cinza (text-mute)
}

export const DEVICE_ORDER: DeviceType[] = [
  'hypervisor', 'server', 'firewall', 'router', 'switch', 'nas', 'workstation',
  'printer', 'camera', 'voip', 'iot', 'mobile', 'unknown',
]

export function deviceColor(t?: string) { return DEVICE_COLOR[(t as DeviceType)] || DEVICE_COLOR.unknown }
export function deviceLabel(t?: string) { return DEVICE_LABEL[(t as DeviceType)] || DEVICE_LABEL.unknown }
export function deviceIcon(t?: string): LucideIcon { return DEVICE_ICON[(t as DeviceType)] || DEVICE_ICON.unknown }
