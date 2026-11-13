import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async file => (await readFile(path.join(root, file), 'utf8')).replace(/^\uFEFF/, '');
const [css, engine, store, app] = await Promise.all([read('styles.css'), read('src/engine.js'), read('src/store.js'), read('src/app.js')]);
const enginePlain = engine.replace(/^export\s+(?=(const|function)\s)/gm, '');
const plain = source => source.replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"]\.\/(?:engine|store)\.js['"];?\s*/gm, '').replace(/^export\s+(?=(const|function)\s)/gm, '');
const storePlain = plain(store);
const appPlain = plain(app);
if (enginePlain.includes('export ') || appPlain.includes("from './engine.js'")) {
  throw new Error('Falha ao converter os módulos. Verifique os imports/exports.');
}
const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#00663B" />
  <meta name="description" content="Marque palpites, vazas, vidas e eliminações do Fodinha com baralho espanhol." />
  <link rel="icon" type="image/svg+xml" href="./assets/icon.svg" />
  <link rel="manifest" href="./manifest.webmanifest" />
  <title>Fodinha · Mesa do almoço</title>
  <style>${css}</style>
</head>
<body>
  <div id="app"><main class="startup"><h1>Fodinha</h1><p>Carregando o marcador…</p></main></div>
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  <dialog id="share-dialog" class="share-dialog"><form method="dialog"><h2>Compartilhar mesa</h2><p>Quem abrir este link pode acompanhar e editar o placar.</p><input readonly aria-label="Link para compartilhar a mesa" onclick="this.select()"><p class="share-feedback" role="status"></p><p>Os celulares precisam acessar a mesma rede do servidor.</p><button class="button primary full">Fechar</button></form></dialog>
  <script>
    window.addEventListener('error', function (e) {
      const el = document.getElementById('app');
      if (el && el.textContent.includes('Carregando o marcador')) {
        const p = document.createElement('p');
        p.style.color = '#ffb3a8';
        p.textContent = 'Erro ao iniciar o marcador: ' + (e.message || 'erro desconhecido');
        el.appendChild(p);
      }
    });
  </script>
  <script>
${enginePlain}
${storePlain}
${appPlain}
  </script>
</body>
</html>
`;
await writeFile(path.join(root, 'index.html'), html, 'utf8');
// Só estes arquivos ficam públicos na Vercel; banco e código do servidor ficam fora.
for (const file of ['index.html','manifest.webmanifest','sw.js','assets/icon.svg','docs/regulamento_fodinha.pdf']) {
 const target = path.join(root,'public',file);
 await mkdir(path.dirname(target),{recursive:true});
 await copyFile(path.join(root,file),target);
}
console.log('index.html atualizado. Execute npm start para acessar o placar com SQLite.');
