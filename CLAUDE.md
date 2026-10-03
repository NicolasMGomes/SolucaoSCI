# Contexto do Projeto

## Visao geral

O repositorio contem uma aplicacao frontend Angular standalone para simular o atendimento de requisicoes entre funcionarios e RH. Ainda nao existe API ou autenticacao real. A interface e em portugues e usa os dados ficticios do dataset local.

## Estrutura relevante

- `FrontEnd/src/app/app.ts`: estado com Angular Signals, carregamento e adaptacao do JSON, selecao de perfil, filtros, criacao e atualizacao de requisicoes/mensagens.
- `FrontEnd/src/app/dashboard.html`: template da tela de funcionario, painel de RH, formulario de nova requisicao e chat individual.
- `FrontEnd/src/app/app.css`: estilos da aplicacao; importado globalmente por `FrontEnd/src/styles.css` para nao exceder o limite de CSS por componente do Angular.
- `FrontEnd/src/app/app.routes.ts`: rotas Angular; atualmente nao ha rotas configuradas.
- `FrontEnd/public/data/fecha-comigo.json`: dataset mockado com empresas, funcionarios, pendencias e historicos.

A aplicacao usa Angular 21, TypeScript strict, `FormsModule`, control flow nativo (`@if`, `@for`) e nao tem biblioteca de componentes ou backend.

## Dados e regras de negocio

O frontend carrega `/data/fecha-comigo.json` com `fetch`. O historico da pendencia vira a conversa correspondente; cada mensagem preserva autor, papel, data e texto. Mensagens novas podem ter uma lista de nomes de anexos.

A normalizacao dos status do JSON e:

| Status no JSON | Status na interface | Responsavel pela proxima acao |
| --- | --- | --- |
| `aberta`, `aguardando_rh`, `aguardando_contabilidade` | `aberto` | RH |
| `aguardando_funcionario` | `pendente` | Funcionario |
| `resolvida` | `resolvido` | Conversa encerrada |

- Funcionario ve apenas as requisicoes do seu `funcionario_id`; o seletor de perfil existe para demonstracao, nao e controle de acesso.
- RH ve todas as requisicoes. Os contadores Todas, Aberto, Pendente e Resolvido filtram a lista.
- Nova requisicao de funcionario registra tipo, assunto, mensagem e anexo opcional. O primeiro status e Aberto.
- Resposta do funcionario muda o status para Aberto, devolvendo a acao ao RH.
- Resposta do RH inclui a escolha do proximo status, inicialmente Pendente. Resolvido encerra o chat; somente RH pode reabrir, voltando para Aberto.
- Os tipos oferecidos no formulario sao ferias, atestado, dados_bancarios, duvida_holerite e dependente. Tipos adicionais ja presentes no dataset tambem devem continuar legiveis na lista.

## Limites da simulacao

- Requisicoes e mensagens novas ficam apenas na memoria da pagina e sao perdidas ao recarregar.
- Anexos nao sao enviados nem armazenados; somente o nome do arquivo e exibido.
- A troca de perfil nao autentica usuarios. O dataset fica publico em `public/` e contem exclusivamente dados ficticios.
- Nao implementar persistencia, envio de email ou seguranca de acesso apenas no frontend.

Para uma versao real, implementar API e banco de dados, autenticacao por SSO ou link magico com validacao do dominio, autorizacao por papel/funcionario, armazenamento privado de anexos e notificacoes por email.

## Desenvolvimento e verificacao

Execute os comandos dentro de `FrontEnd/`:

```bash
npm install
npx @angular/cli serve
npm run build
npm test
```

Use `npm test` para executar os testes do Vitest configurados pelo Angular CLI. O servidor escolhe outra porta se a `4200` ja estiver ocupada.
