# VoxelRig Studio

VoxelRig Studio é um editor 3D de personagens voxelados para criar rigs articulados no estilo Minecraft/Blockbench. O projeto inclui presets 3D, texturização pixel-art com UVs Box, animação procedural, exportação de geometria Bedrock e geração assistida por Gemini.

## Funcionalidades

- Editor 3D interativo com seleção de ossos e cubos.
- Histórico com desfazer, refazer e navegação entre estados.
- Presets de personagens com hierarquia articulada.
- Texturas Box UV geradas em atlas pixel-art.
- Poses procedurais estáticas e de caminhada.
- Exportação para GeoJSON de geometria Bedrock.
- Geração completa de modelos e edição localizada de subárvores por Gemini.

## Tecnologias

- React 19 e TypeScript
- Three.js
- Vite 8
- Express
- Google GenAI SDK
- Tailwind CSS 4

## Início rápido

Pré-requisitos:

- Node.js 22 ou superior
- Bun ou npm

Instale as dependências:

```bash
npm install
```

Configure as variáveis de ambiente:

```bash
cp .env.example .env
```

Defina `GEMINI_API_KEY` no arquivo `.env`. Sem uma chave válida, o servidor continua disponível, mas os endpoints de geração por IA devolvem erro.

Inicie o ambiente de desenvolvimento:

```bash
npm run dev
```

A aplicação fica disponível em `http://localhost:3000`.

## Comandos

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor Express e o Vite em modo de desenvolvimento |
| `npm run build` | Gera a aplicação estática em `dist/` |
| `npm run start` | Executa o servidor em modo de produção |
| `npm run preview` | Previsualiza o resultado do build pelo Vite |
| `npm run lint` | Executa a verificação de tipos TypeScript |
| `npm test` | Executa os testes do compilador e da representação voxel |
| `npm run clean` | Remove artefatos de build locais |

## Estrutura do projeto

```text
src/
  components/  Interface React, viewport 3D e painéis
  core/        Presets, compilação IR, UV atlas e integração Three.js
  types/       Tipos TypeScript do modelo voxel
  App.tsx      Estado principal e fluxo de edição
  main.tsx     Ponto de entrada React
server.ts      Servidor Express e endpoints Gemini
index.html     HTML principal
docs/          Documentação técnica
```

## Configuração

Consulte [.env.example](.env.example) para a lista de variáveis.

- `GEMINI_API_KEY`: chave usada nas chamadas ao Gemini.
- `APP_URL`: URL pública opcional da aplicação.
- `DISABLE_HMR`: defina como `true` para desativar o HMR do Vite.

## API

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/api/health` | Verifica o status e identifica o modelo configurado |
| `POST` | `/api/generate-model` | Gera um modelo voxel completo a partir de um prompt |
| `POST` | `/api/mutate-subtree` | Edita somente a subárvore de um osso selecionado |

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Instalação e desenvolvimento](docs/SETUP.md)
- [Contribuição](docs/CONTRIBUTING.md)