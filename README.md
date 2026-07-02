# S30 Cosmic Companion

Catálogo pessoal de astrofotografia para o SeeStar S30. PWA — funciona offline após a primeira carga.

## Deploy no GitHub Pages (acesso de qualquer lugar, sem servidor)

1. Crie um repositório no GitHub (pode ser privado)
2. Suba todos os arquivos deste projeto pra branch `main`
3. Vá em **Settings → Pages → Branch: main → / (root) → Save**
4. Aguarde ~1 minuto e acesse `https://seu-usuario.github.io/nome-do-repo`

Na primeira visita o app baixa tudo (≈ 150KB). Depois funciona offline.

## Suas fotos ficam onde?

No **IndexedDB do navegador do dispositivo que você usou**. Elas não vão pro GitHub nem pra nenhum servidor. Para não perder: use o botão **Backup** na sidebar regularmente.

## Para levar o catálogo de um dispositivo pra outro

1. No dispositivo original: sidebar → **Backup** → salva o `.json`
2. No novo dispositivo: acessa a URL → sidebar → **Restaurar backup** → seleciona o `.json`

## Atualizar o app depois de mudanças

Incremente `CACHE_NAME` em `sw.js` (ex: `s30-companion-v2`) antes de fazer push. Isso força o navegador a baixar a versão nova.
Commit changes
