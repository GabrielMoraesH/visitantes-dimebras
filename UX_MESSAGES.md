# Padrão de Mensagens e Feedbacks de UX

## Objetivo

Este documento define o padrão interno para mensagens visíveis ao usuário no sistema, incluindo validações, alertas, toasts, estados vazios, loadings, modais e acessibilidade.

O objetivo é manter clareza, consistência, linguagem orientativa, acessibilidade e privacidade, evitando mensagens técnicas e feedback duplicado.

Este guia trata apenas de mensagens exibidas na interface. Logs técnicos, códigos internos e detalhes de backend devem permanecer fora da experiência do usuário comum.

## Princípios

1. Explique o que aconteceu.
2. Oriente o próximo passo sempre que possível.
3. Evite termos técnicos.
4. Evite caixa alta excessiva.
5. Use português correto e acentuação.
6. Não dependa apenas de cor para comunicar estado.
7. Não exiba stack trace, código interno, nomes técnicos de campos ou detalhes de infraestrutura.
8. Não duplique a mesma mensagem em toast, alerta inline e modal.
9. Preserve a privacidade dos dados.
10. Posicione a mensagem próxima ao ponto onde o usuário pode corrigir o problema.

## Campos Obrigatórios

Use mensagens diretas com os verbos `Informe` ou `Selecione`.

Exemplos aprovados:

- "Informe o usuário."
- "Informe a senha."
- "Informe o CPF."
- "Informe o nome completo."
- "Informe o telefone."
- "Informe a empresa."
- "Selecione a filial."
- "Selecione o perfil."

Evite:

- "Campo obrigatório."
- "Preencha o campo."
- "Obrigatório."
- Nomes técnicos de campo.

## Formato Inválido

Explique o formato esperado, não apenas que o valor está inválido.

Exemplos:

- "Digite um CPF válido."
- "Digite um telefone com DDD."
- "Digite um usuário com pelo menos 3 caracteres."
- "Digite uma senha com pelo menos 6 caracteres."
- "Informe uma data e um horário válidos."

Evite:

- "CPF inválido."
- "Valor inválido."
- "Dados inválidos."

## Regras de Negócio

Quando uma operação for bloqueada por regra de negócio, explique claramente o motivo em linguagem de produto.

Exemplos:

- "Este visitante já possui uma visita em aberto nesta filial."
- "Não é possível desativar ou remover o perfil do último administrador ativo."
- "Você não pode desativar o próprio usuário."
- "Esta visita já foi finalizada."
- "Não é possível agendar um evento no passado."

Não exponha códigos internos como `LAST_ACTIVE_ADMIN_REQUIRED`, `SERIALIZATION_CONFLICT` ou `P2002`.

## Documentos e Mídia

Use mensagens orientativas e específicas para captura, validade e upload de mídia.

Padrões:

- "Fotografe o visitante."
- "Fotografe a frente do documento."
- "Fotografe o verso do documento."
- "A frente do documento está expirada. Fotografe-a novamente."
- "O verso do documento está expirado. Fotografe-o novamente."
- "Formato de arquivo não permitido."
- "A mídia excede o tamanho permitido."
- "Não foi possível utilizar esta imagem. Capture outra."
- "Não foi possível utilizar esta mídia. Selecione outro arquivo."

Não mostre termos internos como `photo`, `documentFront`, `documentBack`, `MIME`, `buffer`, `multipart`, `path` ou nomes técnicos equivalentes.

## Erros de Rede

Use este padrão quando não houver resposta HTTP:

- "Não foi possível conectar ao servidor."
- "Verifique sua conexão e tente novamente."

Evite:

- "Erro de rede."
- "Erro interno."
- Mensagens cruas de `Axios`, `fetch` ou bibliotecas similares.

## Erros Inesperados

Use uma mensagem genérica quando a causa não puder ser afirmada com segurança:

- "Não foi possível concluir a operação."
- "Tente novamente em alguns instantes."

Quando possível, nomeie a ação:

- "Não foi possível realizar o login."
- "Não foi possível concluir o cadastro."
- "Não foi possível gerar a etiqueta."
- "Não foi possível atualizar o usuário."
- "Não foi possível cancelar o agendamento."

Não invente causa para o erro.

## Sucesso

Use o padrão: objeto + ação + "com sucesso."

Exemplos:

- "Usuário criado com sucesso."
- "Agendamento atualizado com sucesso."
- "Conteúdo excluído com sucesso."
- "Check-out realizado com sucesso."

Use um único toast quando apropriado. Evite duplicar sucesso em toast, modal, banner ou navegação.

## Estados Vazios

Estados vazios devem contextualizar a tela, filtros ou tipo de registro.

Exemplos:

- "Nenhuma visita foi encontrada no histórico."
- "Nenhuma visita foi encontrada para os filtros informados."
- "Nenhum agendamento encontrado."
- "Nenhum conteúdo cadastrado."
- "Nenhum registro de auditoria foi encontrado."

Evite "Nenhum registro encontrado." quando houver contexto melhor.

## Loading

O texto visual deve indicar a ação em andamento:

- "Entrando..."
- "Salvando..."
- "Gerando etiqueta..."
- "Carregando usuários..."
- "Carregando agenda..."
- "Carregando conteúdos..."
- "Carregando histórico..."
- "Carregando auditoria..."

Para leitores de tela, use mensagem acessível no formato ação + ", aguarde...".

Exemplos:

- "Salvando cadastro, aguarde..."
- "Gerando etiqueta, aguarde..."
- "Carregando histórico, aguarde..."

Use `role="status"` e `aria-live` quando apropriado. Spinners decorativos devem usar `aria-hidden`.

## Alertas Inline

Use alerta inline para problemas que o usuário pode corrigir na própria tela, como campo obrigatório, formato inválido, documento ausente, documento expirado ou mídia ausente.

O alerta consolidado deve usar:

- "Corrija os campos:"
- "Atualize os documentos:" quando somente documentos estiverem pendentes.

As mensagens da lista devem ser exatamente iguais às mensagens inline dos campos ou itens correspondentes.

## Toasts

Use toast principalmente para sucesso, informação e erros que não podem ser corrigidos diretamente no formulário.

Não use toast como único feedback para:

- Campo obrigatório.
- Validação.
- Documento expirado.
- Mídia ausente.
- Erro de formulário.

Evite toast e alerta inline duplicando a mesma mensagem.

## Modais

Use modal para confirmação, detalhes, captura, leitura ou fluxos que realmente exigem contexto isolado.

Não use modal apenas para validação simples.

Confirmações devem ter título, mensagem e botões específicos.

Exemplo:

| Elemento | Texto |
| --- | --- |
| Título | "Cancelar agendamento" |
| Mensagem | "Tem certeza de que deseja cancelar este agendamento?" |
| Botão secundário | "Voltar" |
| Botão principal | "Cancelar agendamento" |

Evite "Tem certeza?", "OK" ou "Confirmar" quando a ação específica puder ser nomeada.

## Acessibilidade

Erros:

- Use `role="alert"` quando apropriado.

Campos:

- Use `aria-invalid` para indicar erro.
- Use `aria-describedby` para associar campo e mensagem.

Loading:

- Use `role="status"`.
- Use `aria-live` quando a atualização precisar ser anunciada.

Modais:

- Use `role="dialog"`.
- Use `aria-modal="true"`.
- Defina foco inicial.
- Permita fechar com `Escape` quando aplicável.
- Retorne o foco ao elemento de origem.
- Bloqueie o scroll do `body` enquanto o modal estiver aberto.

Após submit inválido:

- Foque o alerta.
- Faça scroll somente após ação do usuário.
- Respeite `prefers-reduced-motion`.

Nunca dependa apenas de cor para comunicar erro, sucesso, atenção ou estado.

## Termos Técnicos

Não mostre ao usuário comum:

- `branchId`
- `userId`
- `entityId`
- `photo`
- `documentFront`
- `documentBack`
- `Prisma`
- `Axios`
- `stack`
- `SQL`
- `JWT`
- `token`
- `MIME`
- `Buffer`

Exceção: a tela de Auditoria, exclusiva para `ADMIN`, pode mostrar informações técnicas quando forem úteis para investigação, como `Request ID`, endereço IP, navegador, `User-Agent`, metadados e identificadores técnicos.

Mesmo na Auditoria, não mostre senha, token, CPF, documentos ou dados sensíveis.

## Padrão por Tela

Este padrão já foi aplicado nas seguintes áreas:

- Login.
- Cadastro.
- Check-in.
- Check-out.
- Usuários.
- Agenda.
- Conteúdo TV.
- Histórico.
- Auditoria.

Não é necessário reproduzir todas as mensagens de cada tela. Use os exemplos deste documento como referência para manter o mesmo tom.

## Checklist para Novas Funcionalidades

- [ ] Campos obrigatórios usam "Informe..." ou "Selecione..."
- [ ] Formatos inválidos explicam o formato esperado.
- [ ] Erros de rede são diferenciados.
- [ ] Erros inesperados não inventam causa.
- [ ] Mensagens técnicas não vazam.
- [ ] Validações corrigíveis usam inline.
- [ ] Toast não duplica alerta.
- [ ] Estado vazio tem contexto.
- [ ] Loading possui texto acessível.
- [ ] `role` e `aria` estão corretos.
- [ ] Foco e scroll são tratados.
- [ ] Ortografia e acentuação foram revisadas.
- [ ] Mensagens seguem o mesmo tom do sistema.

## Exemplos

| Ruim | Bom |
| --- | --- |
| "Campo obrigatório." | "Informe o nome completo." |
| "CPF inválido." | "Digite um CPF válido." |
| "Erro ao salvar." | "Não foi possível salvar os dados. Tente novamente em alguns instantes." |
| "branchId inválido." | "A filial selecionada não está disponível." |
| "Erro interno." | "Não foi possível concluir a operação. Tente novamente em alguns instantes." |

## Manutenção

Novas mensagens devem seguir este guia. Mudanças relevantes no padrão de linguagem, validação, feedback ou acessibilidade devem atualizar este arquivo.

Evite criar mensagens duplicadas em vários componentes quando já existir utilitário central do domínio.

Códigos internos do backend devem ser mapeados para mensagens amigáveis no frontend quando necessário.
