// Classificação de dispositivo de rede — função PURA, sem I/O (estilo asm/score.js).
// Heurística determinística sobre portas + serviços + fabricante do MAC + OS.
// Não usa LLM: rápido, barato, reproduzível. Retorna { deviceType, confidence }.
//
// A ordem importa: sinais mais específicos (impressora/câmera) antes dos genéricos
// (servidor/estação). O primeiro que casa vence.

// Fabricantes por categoria (substring, case-insensitive no vendor do OUI).
const VENDOR = {
  network: ['cisco', 'juniper', 'arista', 'aruba', 'ubiquiti', 'mikrotik', 'huawei', 'tp-link', 'netgear', 'zyxel', 'ruckus', 'extreme'],
  firewall: ['fortinet', 'palo alto', 'sonicwall', 'check point', 'watchguard', 'sophos'],
  printer: ['hewlett', 'hp inc', 'lexmark', 'canon', 'epson', 'brother', 'xerox', 'kyocera', 'ricoh', 'zebra'],
  camera: ['hikvision', 'dahua', 'axis comm', 'hanwha', 'vivotek', 'reolink', 'amcrest', 'ubiquiti'],
  // Fabricantes VoIP-específicos. Cisco fica de fora de propósito (faz rede E
  // telefonia) — VoIP exige sinal real de SIP (porta/serviço/hostname), senão um
  // switch Cisco cairia como telefone.
  voip: ['polycom', 'yealink', 'grandstream', 'avaya', 'mitel'],
  nas: ['synology', 'qnap', 'netgear', 'western digital', 'buffalo'],
  iot: ['espressif', 'sonoff', 'tuya', 'shelly', 'nest', 'ring', 'philips', 'raspberry', 'texas instruments'],
  mobile: ['apple', 'samsung', 'xiaomi', 'oneplus', 'google', 'motorola', 'huawei'],
}

function vendorIs(vendor, cat) {
  if (!vendor) return false
  const v = String(vendor).toLowerCase()
  return (VENDOR[cat] || []).some((x) => v.includes(x))
}

function classifyDevice({ os = '', openPorts = [], macVendor = '', hostname = '' } = {}) {
  const ports = new Set((openPorts || []).map((p) => Number(p.port)).filter(Boolean))
  const services = (openPorts || []).map((p) => String(p.service || '').toLowerCase())
  const has = (...ps) => ps.some((p) => ports.has(p))
  const svc = (...names) => services.some((s) => names.some((n) => s.includes(n)))
  const osl = String(os || '').toLowerCase()
  const host = String(hostname || '').toLowerCase()

  // Impressora — portas de impressão são muito específicas.
  if (has(9100, 515, 631) || svc('ipp', 'jetdirect', 'printer') || vendorIs(macVendor, 'printer') || /print|mfp|hp[- ]?laser/.test(host)) {
    return { deviceType: 'printer', confidence: 'high' }
  }
  // Câmera IP.
  if (has(554) || svc('rtsp', 'onvif') || vendorIs(macVendor, 'camera') || /cam(era)?|ipcam|nvr|dvr/.test(host)) {
    return { deviceType: 'camera', confidence: 'high' }
  }
  // VoIP.
  if (has(5060, 5061) || svc('sip') || vendorIs(macVendor, 'voip') || /voip|phone|sip/.test(host)) {
    return { deviceType: 'voip', confidence: 'medium' }
  }
  // NAS.
  if (vendorIs(macVendor, 'nas') || /nas|synology|qnap|diskstation/.test(host) || (has(445, 139, 2049, 111) && svc('iscsi', 'nfs'))) {
    return { deviceType: 'nas', confidence: 'medium' }
  }
  // Hypervisor (ESXi/vCenter/Proxmox/Hyper-V/XenServer) — ANTES de "servidor",
  // senão um ESXi (22+443 abertos) cairia como servidor genérico e o operador
  // perderia o alvo mais valioso da rede. Portas de gerência são específicas:
  // 902 = vSphere authd, 5989 = CIM, 5480 = VAMI, 8006 = Proxmox, 2179 = Hyper-V.
  if (has(902, 5989, 5480, 8006, 2179) ||
      svc('vmware-auth', 'vmware', 'esxi', 'vcenter', 'proxmox') ||
      /esxi|vcenter|vsphere|vmware|proxmox|\bpve\b|xenserver|hyper-?v/.test(osl) ||
      /esx|vcenter|vsphere|proxmox|\bpve\d?\b|\bhv\d/.test(host)) {
    return { deviceType: 'hypervisor', confidence: 'high' }
  }
  // Firewall.
  if (vendorIs(macVendor, 'firewall') || /firewall|fortigate|palo|asa|pfsense|sonicwall/.test(host)) {
    return { deviceType: 'firewall', confidence: 'high' }
  }
  // Equipamento de rede (switch/roteador) — SNMP + vendor de rede, ou hostname.
  if (vendorIs(macVendor, 'network') || (has(161) && !svc('http')) || /switch|router|gateway|\bap\b|\bsw\d|\brtr/.test(host)) {
    // roteador se tiver serviço de roteamento/telnet de borda; senão switch.
    if (/router|gateway|\brtr|\bgw\b/.test(host) || has(179, 1723)) return { deviceType: 'router', confidence: 'medium' }
    return { deviceType: 'switch', confidence: 'medium' }
  }
  // Móvel.
  if (vendorIs(macVendor, 'mobile') && ports.size <= 1) {
    return { deviceType: 'mobile', confidence: 'low' }
  }
  // IoT — fabricante de IoT e poucas portas.
  if (vendorIs(macVendor, 'iot') || /esp|sonoff|shelly|smart|iot/.test(host)) {
    return { deviceType: 'iot', confidence: 'low' }
  }
  // Servidor — OS de servidor OU serviços de servidor típicos.
  const serverPorts = has(22, 3389, 445, 3306, 5432, 1433, 25, 53, 389, 636, 88)
  if (/server|linux|ubuntu server|windows server|centos|debian|red hat|esxi|vmware/.test(osl) || serverPorts || /srv|server|dc\d|db\b|web\b/.test(host)) {
    // Estação Windows desktop tem RDP+SMB mas OS "desktop"; refina abaixo.
    if (/windows (7|8|10|11|xp|vista)/.test(osl) && !/server/.test(osl)) {
      return { deviceType: 'workstation', confidence: 'medium' }
    }
    return { deviceType: 'server', confidence: serverPorts ? 'medium' : 'low' }
  }
  // Estação de trabalho — OS de desktop.
  if (/windows (7|8|10|11|xp|vista)|mac os|macos|desktop/.test(osl)) {
    return { deviceType: 'workstation', confidence: 'medium' }
  }

  return { deviceType: 'unknown', confidence: 'low' }
}

module.exports = { classifyDevice, VENDOR }
