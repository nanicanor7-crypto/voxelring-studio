# Contribuição

## Fluxo sugerido

1. Crie uma branch a partir da branch principal.
2. Faça alterações pequenas e específicas.
3. Execute lint, testes e build.
4. Descreva claramente o comportamento alterado no pull request.

## Organização

- Componentes React e painéis ficam em `src/components/`.
- Lógica de modelo, hierarquia, atlas e exportação fica em `src/core/`.
- Contratos de dados ficam em `src/types/`.
- Rotas e integrações externas ficam em `server.ts`.

## Convenções

- Preserve a tipagem TypeScript.
- Não acople modelos Bedrock diretamente aos componentes de interface.
- Use funções existentes de normalização e clonagem antes de alterar o IR.
- Preserve a orientação Y positiva para cima e o plano do chão em Y=0.
- Não coloque arquivos temporários ou artefatos gerados no repositório.

## Validação

Antes de enviar uma alteração:

```bash
npm run lint
npm test
npm run build
```
