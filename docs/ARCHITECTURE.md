# Arquitetura

## Visão geral

O VoxelRig Studio usa uma representação intermediária (IR) independente de Three.js e do formato Bedrock. Essa separação permite editar, validar, texturizar e exportar o mesmo modelo sem acoplamento direto ao renderer.

```text
Preset ou resposta Gemini
        |
        v
VoxelModelIR
  - ossos
  - pivôs
  - cubos
        |
        +--> Resolver de hierarquia
        +--> Gerador de atlas UV
        +--> Compilador Bedrock GeoJSON
        +--> Construção Three.js
```

## Representação intermediária

Os tipos principais ficam em `src/types/voxel.ts`. Um modelo contém:

- Metadados de nome e descrição.
- Uma lista plana de ossos em ordem pai antes de filho.
- O pivô relativo de cada osso.
- Cúbicos associados ao osso.
- Cores, padrões, inflação e rotações de cada cúbico.

O resolver calcula os pivôs globais a partir da cadeia de parentesco e também produz os centros globais dos cubos.

## Compilação e renderização

`src/core/compiler.ts` centraliza normalização, hierarquia, empacotamento UV, pintura do atlas e compilação para Bedrock.

`src/core/threeBuilder.ts` transforma o IR em:

- Geometrias Three.js.
- Textura CanvasTexture.
- Hierarquia de objetos articulados.
- Overlay de seleção.

`src/core/presets.ts` define modelos de exemplo e o catálogo disponível na interface.

## Servidor

`server.ts` executa o servidor Express. Em desenvolvimento, o Vite é usado como middleware para hot reload. Em produção, o Express disponibiliza os arquivos gerados em `dist/`.

O Gemini recebe instruções estruturadas e schemas JSON. A geração cria um modelo completo; a mutação recebe o modelo atual e altera apenas a subárvore selecionada.

## Exportação

A exportação Bedrock segue `format_version: 1.12.0`, com pivôs globais e cubos originados em coordenadas locais coerentes com o sistema de 16 pixels por bloco.
