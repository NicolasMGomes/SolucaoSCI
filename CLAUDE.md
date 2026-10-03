# Contexto do Projeto

## Visao geral

O repositorio contem uma aplicacao frontend Angular standalone para simular o atendimento de requisicoes entre funcionarios, RH e contabilidade. Ainda nao existe API ou autenticacao real. A interface e em portugues e usa os dados ficticios do dataset local.

## Estrutura relevante

- `FrontEnd/src/app/app.ts`: estado com Angular Signals, carregamento e adaptacao do JSON, selecao de perfil, filtros de status/dono/urgencia, calculo de prazo, criacao e atualizacao de requisicoes/mensagens.
- `FrontEnd/src/app/dashboard.html`: template da tela de funcionario, central de pendencias de RH e contabilidade, formulario de nova requisicao e chat individual.
- `FrontEnd/src/app/app.css`: estilos da aplicacao; importado globalmente por `FrontEnd/src/styles.css` para nao exceder o limite de CSS por componente do Angular. `styles.css` tambem carrega a fonte DM Sans e o Tailwind (configurado via `.postcssrc.json`), usado apenas como reset/utilitarios.
- `FrontEnd/src/app/app.routes.ts`: rotas Angular; atualmente nao ha rotas configuradas.
- `FrontEnd/public/data/fecha-comigo.json`: dataset mockado com empresas, funcionarios, pendencias e historicos.
- `.github/workflows/deploy.yml`: build e publicacao no GitHub Pages.

A aplicacao usa Angular 21, TypeScript strict, `FormsModule`, control flow nativo (`@if`, `@for`, `@let`) e nao tem biblioteca de componentes ou backend.

## Dados e regras de negocio

O frontend resolve o dataset a partir do `<base href>` (`new URL('data/fecha-comigo.json', document.baseURI)`), e nao de um caminho absoluto, para funcionar quando publicado em subdiretorio. O historico da pendencia vira a conversa correspondente; cada mensagem preserva autor, papel, data, canal e texto. Mensagens novas podem ter uma lista de nomes de anexos.

Status e dono sao dimensoes separadas. O status descreve o ciclo de vida; o dono (`responsavel` no JSON) diz com quem esta a bola.

| Status no JSON | Status na interface | Dono derivado de `responsavel` |
| --- | --- | --- |
| `aberta`, `aguardando_rh` | `aberto` | RH |
| `aguardando_contabilidade` | `aberto` | Contabilidade |
| `aguardando_funcionario` | `pendente` | Funcionario |
| `resolvida` | `resolvido` | Conversa encerrada, sem dono |

- Tres perfis simulados: Funcionario, RH e Contabilidade. O seletor existe para demonstracao, nao e controle de acesso.
- Funcionario ve apenas as requisicoes do seu `funcionario_id`. RH ve todas as empresas e pode restringir a uma pelo seletor de empresa. Contabilidade ve todas as empresas do escritorio.
- A identidade de cada perfil vem do dataset: `funcionarios[].email`, `empresas[].rh_nome`/`rh_email` e `escritorio.responsavel_dp`. Nenhum nome e fixo no template.
- Cada card e o chat exibem dono, prazo e o selo `Bloqueia o fechamento`. A lista e ordenada por urgencia: atrasado, vence hoje, vence em ate 3 dias, prazo futuro, sem prazo, encerrado.
- "Hoje" e `meta.data_referencia` do dataset (20/10/2026), tambem usado para datar mensagens e requisicoes novas, para o historico nao ficar fora de ordem. Se o campo faltar, cai na data real.
- Filtros: as abas/cards de status (Todas, Aberto, Pendente, Resolvido), os chips `Bola com` (RH, Contabilidade, Funcionario; apenas perfis internos) e o chip `So urgentes` (atrasadas, vencendo hoje ou que bloqueiam o fechamento). Os contadores de status refletem os demais filtros ativos.
- Nova requisicao de funcionario registra tipo, assunto, mensagem e anexo opcional, com `canal_origem` `rh_net`. O primeiro status e Aberto com dono RH e sem prazo.
- Resposta do funcionario muda o status para Aberto e devolve a bola ao RH.
- Resposta de RH ou contabilidade escolhe o destino: aguardar o funcionario (Pendente), encaminhar a contabilidade, seguir com o RH ou resolver. O mesmo formulario define ou altera o prazo.
- Resolvido encerra o chat. RH e contabilidade podem reabrir, voltando para Aberto com a bola em quem reabriu.
- Os tipos oferecidos no formulario sao ferias, atestado, dados_bancarios, duvida_holerite e dependente. Tipos adicionais ja presentes no dataset tambem devem continuar legiveis na lista.
- `Esc` fecha a camada aberta no topo (chat antes do formulario de nova requisicao).

## Limites da simulacao

- Requisicoes e mensagens novas ficam apenas na memoria da pagina e sao perdidas ao recarregar.
- Anexos nao sao enviados nem armazenados; somente o nome do arquivo e exibido.
- A troca de perfil nao autentica usuarios. O e-mail corporativo e apenas exibido como identidade; nao ha login por e-mail da empresa. O dataset fica publico em `public/` e contem exclusivamente dados ficticios.
- Prazo e dono sao editaveis na sessao, sem notificacao ou lembrete automatico.
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

## Deploy

O workflow `.github/workflows/deploy.yml` roda em cada push na `main`: instala, executa os testes, builda com `--base-href "/<nome-do-repo>/"`, copia `index.html` para `404.html`, cria `.nojekyll` e publica `FrontEnd/dist/FrontEnd/browser` no GitHub Pages. Em Settings > Pages, a origem precisa estar como **GitHub Actions**.

Para reproduzir o build de producao localmente, use `npm run build:pages` (fixa `--base-href /SolucaoSCI/`). Como o dataset e resolvido pelo `<base href>`, o caminho do asset nao pode voltar a ser absoluto.
