# Publicar Fodinha na Vercel com Turso

O projeto está preparado para Vercel Functions e Turso SQL over HTTP. O banco local não é enviado para a hospedagem. O build publica somente a interface, ícone, manifesto, service worker e PDF; a API executa separadamente como função.

## 1. Criar e conectar o banco

Na sua conta Turso, crie um banco chamado `fodinha`. A integração Turso do Marketplace da Vercel também pode ser utilizada. Escolha conscientemente o plano apresentado pelo provedor; o código não cria assinaturas.

Obtenha a URL do banco e um token de acesso ao banco. Configure no projeto da Vercel, em **Settings → Environment Variables**:

- `TURSO_DATABASE_URL`: URL `libsql://…`, `turso://…` ou `https://…` fornecida pelo Turso.
- `TURSO_AUTH_TOKEN`: token do banco.

Selecione o ambiente **Production** e também **Preview** se for testar uma prévia. Não coloque os valores no HTML, no Git, em comentários de código ou em mensagens de chat. O arquivo `.env.example` só documenta os nomes; não contém credenciais válidas.

A tabela é criada automaticamente na primeira requisição. A aplicação recusa iniciar um banco local descartável quando está na Vercel sem as variáveis do Turso.

Documentação oficial: https://docs.turso.tech/integrations/vercel e https://docs.turso.tech/sdk/http/quickstart

## 2. Publicar a pasta do projeto

Se usar o painel da Vercel, importe o repositório desta pasta e escolha **Other** como framework. O `vercel.json` já declara:

- Build: `npm run build`
- Saída estática: `public`
- API: `api/index.js`

Não escolha apenas o arquivo HTML: a aplicação precisa da função e das variáveis de ambiente.

Se preferir a CLI e ela estiver disponível no seu terminal:

```powershell
npx.cmd vercel login
npx.cmd vercel link
```

Escolha/crie o projeto e a conta corretos. Depois de cadastrar as duas variáveis de ambiente no painel do projeto:

```powershell
npx.cmd vercel --prod
```

A CLI pode pedir autorização no navegador. Conclua a autenticação pessoalmente. Este repositório não guarda um token de acesso da Vercel.

Documentação oficial: https://vercel.com/docs/cli/deploy

## 3. Conferir a publicação

Abra `https://SEU-DOMINIO.vercel.app/api/health`. O resultado deve ser um JSON com `ok: true` e `storage: "turso"`. Um erro 503 indica que a conexão com o banco ainda precisa ser configurada.

Abra a página principal, crie uma mesa e compartilhe o link pelo menu. Abra exatamente o mesmo link em outro aparelho, marque um palpite e confira se a alteração aparece. Recarregue a página para confirmar a persistência. Sem o link da mesa, um novo aparelho cria outra mesa, por projeto.

A aplicação continua exibindo avisos de conexão e impedindo sobrescritas entre celulares.

## 4. Levar uma partida local para o site

Antes de trocar de endereço, exporte um JSON em **Menu → Dados da mesa → Exportar backup** na versão local. No site publicado, importe o arquivo pelo mesmo menu. A importação pede confirmação e substitui os dados da mesa selecionada no site. Guarde o arquivo original como backup. O limite de importação é 4 MB.

O `data/fodinha.sqlite` original permanece no computador e não é apagado nem enviado automaticamente.

## Verificação feita nesta preparação

- 42 testes automatizados passaram, cobrindo a interface, regras, SQLite local, protocolo HTTP do Turso, handler da Vercel, conflitos e separação dos arquivos públicos.
- O teste do Turso usa um banco de teste local através do protocolo HTTP simulado. A conexão com um banco real e o deploy precisam ser verificados depois da autenticação e configuração das contas.
- Não há uma URL de produção confirmada nesta preparação.
