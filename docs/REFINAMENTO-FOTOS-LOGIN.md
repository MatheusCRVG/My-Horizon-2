# Refinamento de fotografias e autenticação

Esta alteração usa os componentes existentes. Não muda cálculos financeiros,
IDs, chaves de armazenamento, OAuth, escopos Google ou o formato do cofre.

## Enquadramento

`CoverEditor` usa Pointer Events para arraste e pinça, captura de ponteiros,
roda do mouse com listener não passivo restrito à área da imagem, duplo clique
e duplo toque. Setas movem a fotografia; +/− ajustam o zoom; 0/Home redefinem.
Os botões de ampliar, reduzir e redefinir oferecem as mesmas operações.

O enquadramento tem proporção 16:9. O tamanho da prévia se adapta à altura
disponível, mantendo os controles acessíveis. A imagem começa preenchendo o
quadro; os limites impedem espaços vazios. O zoom vai de 1× a 4× em relação ao
preenchimento inicial. A ampliação preserva o ponto sob o cursor ou sob o
centro do gesto de pinça, exceto quando um limite da fotografia exige ajuste.

O recorte é somente metadado. Novos ajustes usam o campo opcional
`cover.framing: "focal"`; x/y são percentuais do ponto focal da imagem e zoom
é independente da resolução. Os mesmos parâmetros alimentam `HorizonCover`
no dashboard, na lista, nos detalhes, na linha do tempo e nas demais prévias.
Em proporções diferentes, o renderizador mantém o ponto focal e limita a
posição para continuar cobrindo o quadro.

Capas anteriores, sem `framing`, mantêm o resultado exato de object-fit,
object-position e transform-origin que já era utilizado. A conversão ocorre
quando o usuário ajusta o enquadramento. Apenas abrir uma meta não regrava nem
migra sua foto.

Os uploads preservam as validações de formato, assinatura, resolução e tamanho
existentes. O arquivo original do dispositivo não é alterado; o cofre continua
recebendo uma cópia WebP otimizada. O recorte não produz novas recompressões.
Trocar entre miniaturas durante a edição preserva os ajustes temporários de
cada foto, até cancelar ou salvar a meta.

## Modais

A edição de metas separa Objetivo e Foto de capa. O cabeçalho e o rodapé com
Cancelar/Salvar meta permanecem visíveis. Há uma única área de rolagem para o
conteúdo, com margem inferior que considera safe-area-inset-bottom.

O assistente de criação também recebe cabeçalho, etapas e ações fixas. Seus
campos, revisões financeiras e regras de validação permanecem os mesmos.

## Autenticação

A tela mantém duas áreas no desktop: apresentação azul-marinho e entrada em
fundo branco. A imagem da apresentação é uma captura real da seção de
horizontes do dashboard em modo de demonstração, identificada como dados
fictícios. Não contém informações de uma conta real. Em telas pequenas, a
marca e a autenticação têm prioridade.

Google permanece como ação principal; a demonstração é secundária. A
configuração técnica fica na ajuda contextual. Erros só aparecem quando
ativos; avisos de sucesso ou informação são separados dos erros.

O screenshot demonstrativo é um arquivo público estático e faz parte do cache
offline. Nenhuma foto enviada pelo usuário foi adicionada a arquivos públicos.

## Validação

O módulo de geometria possui testes para imagens verticais/horizontais, limites,
zoom ancorado, pinça com centro móvel, persistência, redimensionamento e
compatibilidade com capas antigas. Os testes de interface usam mouse, teclado,
roda e eventos de toque reais do Chromium, incluindo cancelamento e retomada.

Um fluxo com cofre real local e Google simulado verifica upload, criptografia,
salvamento, recarga, desbloqueio e consistência das capas entre telas. OAuth e
demonstração são verificados com respostas simuladas, sem utilizar uma conta
Google real. Os fluxos financeiros anteriores continuam na regressão.
