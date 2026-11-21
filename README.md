# AlternaDrive

Aplicação local para motoristas acompanharem jornadas, embarques, gastos e metas. A interface React usa TypeScript, Vite, Tailwind CSS e MapLibre. O Express serve a API e o Prisma grava no SQLite.

## Executar no Windows

Abra um terminal na pasta deste README com Node.js 22.12 ou superior.

```powershell
npm ci
npm run dev
```

Abra [AlternaDrive](http://localhost:5173). O comando de desenvolvimento prepara o SQLite e aplica as migrações antes de iniciar. O Vite encaminha a API à porta 3001. Se alterar a porta da API local, ajuste também o destino em `vite.config.ts`. Para iniciar em outro terminal ou reiniciar o aplicativo, basta executar `npm run dev`. O banco fica em `prisma/alternadrive.db`.

O mapa abre em João Pessoa, conforme o planejamento da plataforma. O mapa vetorial usa OpenFreeMap com dados do OpenStreetMap e exige internet. O navegador precisa de WebGL. Para centralizar e acompanhar sua posição, use o botão de localização e autorize o acesso ao GPS. A localização é usada no navegador. Salve origem, destino e tarifa em Menu → Configurações → Percurso e tarifa. As sugestões consultam o Photon ao digitar três ou mais caracteres. Selecione uma sugestão em cada campo para salvar os pontos A e B com coordenadas. Se o percurso foi salvo antes desta atualização, selecione novamente os dois endereços. Ao iniciar, o GPS pode substituir a origem somente para aquela jornada. O endereço aproximado é consultado no Photon e as coordenadas são registradas na jornada. Informe no campo **Hhodômetro** a quilometragem total que aparece no painel do veículo. Para apontar para outra instância do Photon, defina `VITE_GEOCODER_URL` no build.

Durante a jornada, mantenha o aplicativo aberto e permita o GPS. Ao receber o primeiro sinal de GPS da jornada, o mapa aproxima, inclina e acompanha o carro. O trecho percorrido some do mapa e o restante fica roxo. Durante a jornada, Embarques, Receita e Lucro estimado aparecem no topo com o controle de privacidade. No rodapé, acompanhe o destino, o tempo restante, o horário previsto de chegada e a distância restante. Toque no destino ou arraste o painel para cima para ver o tempo trabalhado e as demais ações. O Histórico mostra a duração total das jornadas finalizadas. Arraste o mapa para pausar o acompanhamento e toque em **Centralizar no carro** para voltar. Para calcular essa rota, as coordenadas dos dois pontos são enviadas ao roteador OSRM. O serviço pode ser substituído com `VITE_ROUTER_URL` no build. [Serviço de rotas OSRM/FOSSGIS](https://map.project-osrm.org/about.html) A chegada ao ponto de destino alterna automaticamente o próximo destino entre A e B. O aplicativo exige uma leitura de GPS precisa dentro de até 80 metros do destino, com raio menor quando os pontos são próximos. A jornada continua ativa até você tocar em **Finalizar** e informar o hodômetro final.

O mapa traça automaticamente a rota habitual quando houver dados suficientes ou usa a mais rápida nos demais casos. O tempo exibido é estimado, sem trânsito em tempo real. Durante a jornada, leituras consecutivas fora da rota disparam um recálculo a partir da posição atual. Ao concluir um trecho com GPS suficiente, o servidor guarda pontos intermediários resumidos. O último trecho completo de cada motorista de carro ou moto conta como um voto naquele percurso e sentido. Percursos só compartilham votos quando as origens ficam a até 250 m uma da outra e os destinos também. O texto do endereço e os rótulos A e B não entram na comparação. O único motorista já define a **Rota habitual**. Quando outra rota reúne mais da metade dos motoristas com trechos registrados, ela passa a ser a rota habitual para todos. Em caso de empate, vale a última rota que alcançou maioria. As sugestões não mostram contas nem históricos individuais.

Em **Abastecimento**, informe o total pago e o preço por litro ou m³. O app calcula a quantidade e consulta o Photon com a localização atual para sugerir um posto próximo. Confirme o posto para publicar o último preço daquela unidade e daquele combustível no mapa. Apenas o posto, o combustível, o preço e a data são compartilhados com outras contas. O total pago e a posição GPS do motorista não aparecem no mapa de preços. Jornadas novas usam o último preço registrado para o veículo. A primeira referência de preço completa as estimativas pendentes daquele veículo.

No cadastro de veículo, escolha **Carro** ou **Moto**. Na moto, registre um passageiro por embarque. O ícone no mapa acompanha o tipo selecionado para a jornada. Na tela inicial, o botão do olho oculta ou exibe Receita e Lucro estimado.

## Testar

```powershell
npm test
npm run build
```

1. Crie uma conta e cadastre um veículo com consumo de 10 km/L.
2. Salve origem, destino e tarifa de R$ 7,00 nas configurações. Abra uma jornada com hodômetro de 1.000 km.
3. Registre três embarques a caminho de B. Ao chegar a B com o GPS ativo, confira que A se torna o próximo destino. Registre mais dois embarques e finalize em 1.020 km.
4. Lance R$ 5,00 de despesa e R$ 60,00 de abastecimento a R$ 6,00 por litro. No resumo do dia, confira 5 embarques, R$ 35,00 de receita, 20 km, R$ 12,00 de combustível estimado, R$ 5,00 de outras despesas, R$ 60,00 em abastecimentos pagos e R$ 18,00 de lucro.
5. Em Menu → Configurações → Metas de lucro, defina a meta diária de R$ 36,00. Confira o progresso de 50% e a jornada encerrada no histórico. Saia e crie uma segunda conta para conferir que ela começa com dados próprios.

A receita entra no período do embarque. Nas jornadas com alternância automática, a distância e o custo estimado entram ao finalizar, usando a diferença entre os hodômetros inicial e final, o consumo médio e o preço informado no início. Jornadas antigas com volta manual continuam calculadas por perna. O lucro estimado é a receita menos o custo estimado de combustível e as demais despesas. As semanas começam na segunda-feira e o fuso padrão é `America/Fortaleza`. Embarques são contagens acumuladas, compatíveis com a rotatividade de passageiros ao longo do percurso.

## Evoluir para Render e Supabase

1. Faça backup do SQLite e mantenha a migração SQLite no repositório. Crie uma pasta separada para o schema e o histórico de migrações PostgreSQL, troque o provedor para `postgresql` nessa cópia e gere a primeira migração com um PostgreSQL de desenvolvimento. Use esse schema também no `prisma generate`. [Compatibilidade de migrações do Prisma](https://www.prisma.io/docs/orm/v6/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues)
2. Crie um banco de homologação no Supabase. Configure `DATABASE_URL` no Render com a conexão PostgreSQL e use uma conexão direta ou o pooler em modo sessão para as migrações, conforme a rede do serviço. A aplicação continua usando seu próprio login e sessões persistidas por Prisma.
3. Configure um Web Service Node no Render com `NODE_ENV=production`. Instale também as dependências de desenvolvimento na etapa de build, gere o cliente Prisma com o schema PostgreSQL e execute `npm run build`. Aplique a migração PostgreSQL com `prisma migrate deploy --schema <caminho-do-schema>` em uma etapa de release. Use `npm start` para servir a API e o frontend na mesma origem e `/api/health` para verificar o serviço.
4. Caso precise conservar os registros, copie usuários, veículos, jornadas, embarques, lançamentos e metas preservando chaves, datas e centavos. Encerre as sessões locais e compare, em homologação, as contagens e os totais por conta.
5. O mapa vetorial usa o OpenFreeMap por padrão. Para usar um provedor raster, defina `VITE_MAP_TILES` e `VITE_MAP_ATTRIBUTION` no build. [OpenFreeMap](https://openfreemap.org/quick_start/)

Este repositório inicia com SQLite local. A migração e a publicação são etapas futuras.






## Catálogo de veículos

- A identificação por modelo e ano, a partir de 2000, usa a [base aberta fipeX de novembro de 2026](https://github.com/fipex-labs/dataset/releases/tag/v2026.11.0).
- As referências de consumo vêm das [tabelas do PBE Veicular do Inmetro](https://www.gov.br/inmetro/pt-br/assuntos/regulamentacao/avaliacao-da-conformidade/programa-brasileiro-de-etiquetagem/tabelas-de-eficiencia-energetica/veiculos-automotivos-pbe-veicular) de 2022 a 2026. O ano do PBE identifica o ciclo da tabela. Confira se a versão e a motorização correspondem ao veículo.
- A capacidade vem das fichas das montadoras para as versões confirmadas de [Polo](https://www.vw.com.br/idhub/content/dam/onehub_pkw/importers/br/literatura-de-bordo/manual-novo-polo/my25/Polo_BR_25C.5B1.POL_66_LOW.pdf), [Onix e Onix Plus](https://meu.chevrolet.com.br/content/dam/gmownercenter/gmsa/gmbr/dynamic/manuals/2025/chevrolet/Onix/pt/om_ng-chevrolet_Onix_my25-pt_BR.pdf), [Mobi](https://servicos.fiat.com.br/content/dam/fiat/products/handbooks/341/2022/handbook-mobi-2022_2022.pdf) e [CG 160](https://prodsalaimp.honda.com.br/releases/honda-cg-160-2025-nova-geracao-da-motocicleta-preferida-dos-brasileiros-traz-importantes).
