'use strict'
/**
 * O que cada papel PODE VER na interface (Frente 0).
 *
 * O isolamento de DADO vem do banco por tenant — um cliente simplesmente não
 * tem como consultar o dado de outro. Isto aqui é outra coisa: decide o que da
 * OPERAÇÃO fica visível para o cliente dentro do tenant dele.
 *
 * Sem esta distinção, um usuário `client` logado enxergaria a plataforma como
 * um operador interno rebaixado: custo em dólar e tokens do agente, seletor de
 * versão do framework, seletor de modelo, feed cru de comandos e o botão de
 * disparar fase agressiva. Nada disso vaza dado de outro cliente, mas tudo isso
 * é bastidor da nossa operação — e mostrar bastidor é o que faz um produto
 * parecer ferramenta interna em vez de SaaS.
 *
 * Regra de ouro: quando um papel novo aparecer, ele começa SEM permissão e
 * ganha explicitamente. `can()` devolve false para papel desconhecido.
 *
 * Plain JS/CommonJS de propósito: o app TS importa via allowJs e o `node --test`
 * exercita a matriz sem toolchain.
 */

// Capacidades da INTERFACE (não são checagens de segurança — o backend tem as
// dele; estas evitam mostrar ao cliente coisa que é da operação).
const CAPS = {
  admin: [
    'viewCost',          // custo em US$ / tokens consumidos
    'viewAgentInternals',// feed cru do agente, seletor de framework/modelo, contexto
    'runAggressive',     // fases exploit/post
    'viewExecutiveReport',
    'manageUsers',
    'viewAdminPanel',
    'manageSchedule',
    'authorizeDomain',   // gate legal
    'deleteData',
  ],
  user: [
    'viewCost',
    'viewAgentInternals',
    'manageSchedule',
  ],
  // O cliente vê o RESULTADO do trabalho, não a máquina que o produz.
  client: [],
}

function can(role, capability) {
  const caps = CAPS[role]
  return Array.isArray(caps) && caps.includes(capability)
}

/** Açúcar para o caso mais comum na UI. */
function isClient(role) { return role === 'client' }
function isOperator(role) { return role === 'admin' || role === 'user' }

module.exports = { CAPS, can, isClient, isOperator }
