# Instalação e desenvolvimento

## Pré-requisitos

- Node.js 22 ou superior
- npm, Bun ou outro gerenciador compatível

## Instalação

```bash
npm install
cp .env.example .env
```

Edite `.env` e substitua a chave de exemplo:

```dotenv
GEMINI_API_KEY="sua-chave"
```

## Desenvolvimento

```bash
npm run dev
```

O servidor Express será iniciado na porta `3000`. Os arquivos React são servidos pelo Vite com hot reload.

Para desativar o HMR:

```bash
DISABLE_HMR=true npm run dev
```

## Build de produção

```bash
npm run build
npm run start
```

O build gera `dist/` e o Express passa a servir os arquivos estáticos.

## Verificação

```bash
npm run lint
npm test
npm run build
```
