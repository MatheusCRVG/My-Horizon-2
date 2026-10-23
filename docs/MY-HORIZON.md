# My Horizon+ — marca e horizontes

## Identidade

`src/core/brand.ts` centraliza nome, cores e caminhos. O componente `Brand`
seleciona o logo para fundos claros e escuros; `src/my-horizon.css` integra a
marca à interface. O nome do produto é **My Horizon+** e a escrita do logo é
**my horizon⁺**.

Os SVGs em `public/brand/` usam contornos vetoriais, sem depender de uma fonte
instalada: `logo.svg`, `logo-dark.svg`, `symbol.svg` e `app-icon.svg`. Os dois
logos têm fundo transparente e recorte justo. O desenho foi reconstruído a
partir da referência fornecida; o arquivo vetorial original não foi fornecido.
As letras usam contornos de Poppins Light/Bold, com licença OFL incluída em
`FONT-LICENSE.txt`. Há também PNGs transparentes dos logos. Favicon e ícones
192/512 da instalação usam somente o símbolo; os ícones de instalação têm
área segura sobre fundo branco.

Não foram alterados nomes de armazenamento, banco, escopo do service worker,
Client ID, identificadores OAuth, marcadores de pastas do Drive ou endereço.
O nome interno do pacote também foi mantido.

## Estrutura compartilhada e persistência

`goal` e `trip` continuam sendo as entidades existentes. `src/core/horizons.ts`
define categorias, capas padrão e favoritos; `HorizonCard`, `HorizonDetails` e
`HorizonsDashboard` reutilizam a mesma entidade, sem copiar objetivos. As
viagens mantêm seus custos e cenários. Metas anteriores recebem capa derivada
da categoria sem exigir migração destrutiva.

Busca, categoria e situação filtram a lista e todos os seus resumos. Favoritos
e `dashboardOrder` ficam na própria entidade. Arquivar preserva saldo,
histórico, foto e plano, e retira o objetivo dos destaques.

O campo `cover` guarda seleção de galeria ou foto comprimida, posição horizontal
e vertical e aproximação. Uploads não são enviados a um serviço público:
acompanham o objetivo no cofre AES-GCM existente, IndexedDB, backups e
snapshots criptografados do Drive, vinculados à conta existente.

Uploads aceitam JPEG, PNG e WebP de até 8 MB, com assinatura compatível e
decodificação válida. A resolução deve ser no mínimo 240 × 160, no máximo
10.000 pixels por lado e 40 milhões de pixels. O navegador gera WebP de até
1.200 pixels no maior lado e até 220 KB; o processo remove os metadados
originais. SVG e outros formatos não são aceitos. O salvamento fica bloqueado
durante o processamento. Erros são exibidos sem substituir a capa anterior.
Há alternativa por ícone e fallback para imagem indisponível.

## Valores e cálculos

Planos não aumentam a reserva. Movimentações confirmadas continuam usando a
entidade `contribution`; retiradas positivas têm `direction: "withdrawal"`.
Reserva = valor inicial legado + aportes confirmados − retiradas confirmadas.
O histórico e o gráfico real usam esse saldo líquido; o resumo de aportes usa
os depósitos brutos. Projeções têm traço e identificação próprios e não supõem
rendimento. Metas sem prazo não recebem alertas de atraso.

Adicionar ou retirar valores apenas organiza dinheiro já existente, sem
criar receita, despesa ou transferência bancária. A validação central impede
reserva global acima da capacidade disponível, reutilização simultânea da
mesma movimentação e retiradas acima do saldo cronológico do objetivo.
Também verifica edições e exclusões de aportes que sustentam retiradas.
Arquivar não libera o dinheiro: o usuário deve registrar uma retirada para
fazê-lo. Valores acima da meta aparecem como excedente e não são cortados.

## Galeria

As 12 imagens WebP são servidas localmente e incluídas no cache offline.
Origem: Unsplash, conforme a [licença](https://unsplash.com/license).
Cada identificador abaixo corresponde a
`https://images.unsplash.com/<identificador>`:

| Arquivo em public/covers | Identificador da foto            |
| ------------------------ | -------------------------------- |
| travel-coast.webp        | photo-1519046904884-53103b34b206 |
| travel-mountains.webp    | photo-1464822759023-fed622ff2c3b |
| car-sport.webp           | photo-1503376780353-7e6692767b70 |
| car-road.webp            | photo-1492144534655-ae79c964c9d7 |
| home-modern.webp         | photo-1600596542815-ffad4c1539a9 |
| home-interior.webp       | photo-1600210492486-724fe5c67fb0 |
| study-books.webp         | photo-1507842217343-583bb7270b66 |
| study-desk.webp          | photo-1456324504439-367cee3b3c32 |
| reserve-lake.webp        | photo-1470770841072-f978cf4d019e |
| reserve-forest.webp      | photo-1448375240586-882707db888b |
| personal-bike.webp       | photo-1485965120184-e220f721d03e |
| personal-sunrise.webp    | photo-1470252649378-9c29740c9fa8 |

## Configurações externas

O título do Site e o conteúdo do app usam My Horizon+. O nome e o logo
mostrados na autorização oficial do Google são gerenciados no Google Cloud,
fora deste repositório. Atualize-os no projeto do Client ID existente sem
substituir esse identificador nem ampliar o escopo `drive.file`.

O endereço atual foi preservado. Um domínio próprio exige registro, DNS e
conexão com a hospedagem; após conectar, a nova origem HTTPS também precisa
estar cadastrada no cliente OAuth. Esta atualização não compra domínio nem
altera origens autorizadas. Instalações PWA existentes podem precisar ser
reabertas ou reinstaladas para o sistema atualizar nome e ícone.

## Verificação

`tests/horizons.test.ts` cobre retiradas, capacidade, origem dos recursos,
exclusão de aportes, arquivamento, excedente e ausência de prazo. Os testes de
interface em `tests/e2e/horizons.spec.ts` cobrem criação, edição, upload inválido
e válido, enquadramento, favoritos, filtros, aporte, retirada, conclusão,
arquivamento e restauração em desktop e celular. O teste de restauração do
Drive inclui a foto em dois dispositivos com respostas Google simuladas.

`scripts/check-my-horizon.mjs` verifica login, dashboard, lista, detalhes,
editor, viagens, configurações e tema escuro em 360, 768, 1440 e 2542 pixels.
`scripts/check-savings-offline.mjs` verifica o build de produção e a reserva
criptografada após recarga offline. Esses testes não autorizam uma conta
Google real.
