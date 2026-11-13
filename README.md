# Fodinha · Placar da mesa

Placar para celular em modo escuro, com um bloco de tela por participante. O verde `#00663B` é a cor principal; o laranja `#F37435` é a cor secundária. Quatro jogadores usam quatro quadrantes. Cada bloco mostra o nome, as vidas no canto superior e **Palpite** e **Fez** em destaque no centro.

## Iniciar

Requer Node.js 22.13 ou superior. No PowerShell, dentro da pasta do projeto:

```powershell
npm.cmd run dev
```

Abra **http://localhost:3000**. O terminal também mostra o endereço para celulares na mesma rede do computador. O servidor deve permanecer ligado durante o jogo. `npm.cmd start` inicia sem reconstruir a página.

## Jogar

1. Na primeira abertura, escolha a quantidade de jogadores, informe os nomes em sentido horário e configure vidas iniciais, critério de desempate e primeiro pé.
2. Toque em **Iniciar partida**. A área de jogo se divide entre os participantes, sem uma lista de cartões para rolar. Os nomes acompanham o sentido horário também na tela; em quantidades ímpares, um bloco ocupa o espaço restante da linha. O layout se adapta à orientação da tela.
3. As **Cartas** são atualizadas automaticamente após cada rodada: sobem de 1 até o limite de 40 cartas dividido pelos jogadores ativos, depois descem até 1 e reiniciam. A barra superior permite corrigir a quantidade manualmente.
4. Somente o jogador da vez pode editar **Palpite**, digitando ou usando `−` e `+`. O palpite começa em **0** em cada vez: para pedir zero, basta confirmar. Use `+` para aumentar ou digite outro valor. Toque em **Confirmar palpite** para liberar o próximo jogador em sentido horário. O pé é o último a falar; seu bloco tem fundo e selo de destaque. O valor proibido pela regra do pé não pode ser confirmado. Depois de todos confirmarem, os controles **Fez** são liberados e o botão muda para **Finalizar rodada**.
5. Toque em **Finalizar rodada** depois de conferir os totais. O sistema desconta uma vida por vaza de diferença e elimina quem zerou. O botão fecha os totais da mão; não registra vencedores de vazas individuais.

Os eliminados continuam no próprio espaço, com os controles desativados. Isso mantém a posição dos jogadores durante toda a partida. Ao restar um sobrevivente, o placar informa o vencedor.

**Menu → Reiniciar jogo** pede a confirmação “Deseja realmente iniciar um novo jogo?”. Ao confirmar, reinicia com os mesmos nomes, vidas iniciais, critério e primeiro pé configurados. Cancelar mantém a partida intacta. **Configurar nova partida** permite trocar esses dados. O menu também reúne regras e desfazer a última rodada. Também permite desfazer o último palpite confirmado enquanto nenhum resultado foi marcado, para corrigir um erro de digitação. Correções de vidas, penalidades e troca do pé ficam em **Ajustes da rodada**. Compartilhamento e backup ficam em **Dados da mesa**. As estatísticas e conquistas foram retiradas desta versão; dados antigos já existentes no servidor não são apagados.

A tela de regras mantém as seções recolhíveis, a hierarquia das cartas e o link para o PDF fornecido pela mesa.

## Salvamento e acesso pelos celulares

No uso local, os dados da partida ficam no SQLite em **`data/fodinha.sqlite`**. Na Vercel, ficam no **Turso**, configurado pelas variáveis de ambiente do servidor. O navegador guarda apenas o identificador da mesa. Uma partida em andamento é retomada ao reabrir o link; quando não há partida, a aplicação abre a configuração.

Use **Menu → Dados da mesa → Compartilhar mesa** para abrir a mesma partida nos demais celulares. Quem tem o link pode editar. No uso local, os aparelhos precisam alcançar a mesma rede do servidor; no site publicado na Vercel, basta acessar o link pela internet. O aplicativo não altera o firewall.

As alterações são salvas a cada marcação. Se a conexão cair, os ajustes ficam pendentes na memória da página: mantenha-a aberta até reconectar ou exporte um backup. Edições simultâneas conflitantes são recusadas para impedir a sobrescrita silenciosa do placar de outro celular.

O PDF e o placar seguem a regra de perda por diferença. Com dois finalistas eliminados juntos, ambos retornam com uma vida. Se três ou mais sobreviventes zerarem juntos, a aplicação pede que a mesa resolva o desempate e corrija as vidas, pois o PDF não define essa exceção.

## Hospedagem e desenvolvimento

A configuração da Vercel está em `vercel.json`: interface em `public` e API em `api/index.js`, com Turso para persistência. As instruções completas estão em [Publicar na Vercel](docs/PUBLICAR-VERCEL.md). O código está preparado; a publicação depende da autenticação e das credenciais das suas contas. Abrir apenas o HTML ou publicar somente arquivos estáticos não disponibiliza a API.

Variáveis opcionais: `PORT` (padrão 3000), `HOST` (padrão `0.0.0.0`) e `DATABASE_PATH` (caminho do banco). Para copiar a pasta `data` inteira como backup, pare o servidor antes. Também é possível exportar e importar o JSON da mesa pelo menu.

```powershell
npm.cmd run build
npm.cmd test
```

O código da interface está em `src/app.js` e `styles.css`; `tools/build.mjs` gera o `index.html`. As regras ficam em `src/engine.js`; formato dos dados em `src/store.js`; API e SQLite em `server.mjs`.

Os 42 testes cobrem configuração, blocos para 3 a 8 participantes, marcação direta, vidas e eliminações, desfazer, regras, retomada e conflitos de gravação, ordem dos palpites, confirmação do pé, subida e descida de cartas, além de persistência SQLite após reiniciar o servidor. A verificação visual da nova tela não foi concluída: a interação no navegador foi interrompida pelo usuário com Escape.





