# API pessoal: Open Finance → Minhas Finanças

Esta API busca seus **cartões, limites, compras e saldos** nos bancos (via Pluggy / Meu Pluggy, gratuito para uso pessoal, até 5 bancos) e entrega ao app.

## Segurança: o que fica onde

| Item | Onde fica | Público? |
|---|---|---|
| Código do app e da API | GitHub (este repositório) | Sim, mas é só código, sem nenhum dado seu |
| Client ID / Client Secret da Pluggy | Variáveis de ambiente do Vercel (criptografadas) | **Não** |
| Senha da API (`APP_SENHA`) | Vercel + seu celular | **Não** |
| Seus cartões, compras e contas | Só no seu celular | **Não** |

- O Open Finance é **somente leitura**: nem a Pluggy nem esta API conseguem movimentar dinheiro.
- A API recusa chamadas sem a senha e só aceita chamadas do navegador vindas do seu app.
- A API não guarda nada: os dados passam por ela e vão direto para o celular.
- **Nunca** coloque Client Secret ou senha em arquivo do GitHub, chat ou print. Se vazar, gere outro no Dashboard da Pluggy e troque no Vercel.

## Passo a passo

### 1. Meu Pluggy: conectar os bancos
1. Acesse **meu.pluggy.ai** e crie sua conta.
2. Conecte cada banco (Bradesco, Itaú, Nubank, Porto). A autorização é feita no site ou app do banco.

### 2. Dashboard da Pluggy: gerar as chaves
1. Acesse **dashboard.pluggy.ai** e crie uma conta, de preferência com o mesmo e-mail.
2. Crie uma **Aplicação** e anote o **Client ID** e o **Client Secret**. Guarde num lugar seguro.
3. Na aplicação, use **Connect Account** e escolha o conector **MeuPluggy**, não o banco direto nem o Sandbox. Repita para cada banco.
4. Copie o **Item ID** de cada conexão (um código longo, tipo `a1b2c3d4-...`).

### 3. Vercel: publicar a API
1. Acesse **vercel.com** e clique em *Sign up* → *Continue with GitHub*.
2. Clique em **Add New → Project** e importe o repositório `desktop-tutorial`.
3. Em **Root Directory**, clique em *Edit* e escolha **`servidor`**. Em *Framework Preset*, deixe **Other**.
4. Abra **Environment Variables** e adicione:
   - `PLUGGY_CLIENT_ID`: o Client ID
   - `PLUGGY_CLIENT_SECRET`: o Client Secret
   - `PLUGGY_ITEM_IDS`: os Item IDs separados por vírgula
   - `APP_SENHA`: uma senha longa que você inventar (ex.: 4 palavras aleatórias)
   - `ORIGEM_PERMITIDA`: `https://robzogno.github.io`
5. Clique em **Deploy**. O endereço aparece no final (ex.: `https://desktop-tutorial-xyz.vercel.app`).

> Se o Vercel pedir para escolher uma branch, use a mesma do GitHub Pages.

### 4. No app (celular)
Vá em **Ajustes → Conectar aos bancos**, cole o endereço do Vercel e a `APP_SENHA`, e toque em **Salvar e sincronizar**.

## Bom saber
- Os bancos atualizam os dados mais ou menos **uma vez por dia**, então não é em tempo real.
- A autorização no Open Finance **vence** de tempos em tempos. O app avisa e você renova no Meu Pluggy.
- Compras parceladas viram uma compra só, com as parcelas distribuídas nas faturas.
- Pagamentos de fatura e estornos não são importados como compras.
- Se você excluir uma compra importada, ela não volta na próxima sincronização.
