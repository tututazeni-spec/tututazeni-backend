# Módulo Organization

Módulo responsável pela estrutura organizacional da empresa, **sem duplicar** funcionalidades que já pertencem a Departments, Users, Roles & Permissions e Positions/Cargos.

**Abas:** Visão Geral, Estrutura Organizacional, Unidades, Departamentos, Cargos & Posições, Organograma, Localizações

---

## 1. Visão Geral

Total de colaboradores, total de unidades, total de departamentos, total de cargos, total de localizações, departamentos ativos, unidades ativas, posições ocupadas, posições disponíveis, colaboradores por unidade, por departamento, por cargo, distribuição hierárquica, gestores, posições críticas, alterações recentes na estrutura, alertas organizacionais.

**Gráficos:** colaboradores por unidade, colaboradores por departamento, distribuição por nível hierárquico, evolução do headcount, estrutura organizacional.

## 2. Estrutura Organizacional

**Conteúdo:** empresa, grupo empresarial, unidades, áreas, departamentos, subdepartamentos, cargos, posições, relações hierárquicas, responsáveis, gestores, centros de custo, localizações.

**Ações:** criar unidade, criar departamento, criar subdepartamento, criar estrutura, reorganizar departamento, mover departamento, definir responsável, definir gestor, ativar, desativar, visualizar histórico.

## 3. Unidades

**Conteúdo:** lista de unidades, código, nome, tipo, descrição, localização, responsável, gestor, departamento principal, centro de custo, número de colaboradores, estado, data de criação.

### Modal: Nova Unidade

Nome da unidade, código, tipo de unidade, descrição, empresa, localização, endereço, província, município, responsável, gestor, centro de custo, telefone, e-mail, número máximo de colaboradores, estado, data de início, observações.

## 4. Departamentos

Integrar ou disponibilizar a gestão do módulo Departments. **O Organization deve consumir os dados do Departments.**

**Conteúdo:** departamentos, subdepartamentos, unidade, responsável, gestor, colaboradores, cargos, centro de custo, estado, estrutura hierárquica.

**Ações:** novo departamento, editar, ver detalhes, adicionar subdepartamento, atribuir responsável, ver colaboradores, ver cargos, desativar.

## 5. Cargos & Posições

**Cargo** = função/título profissional. **Posição** = lugar concreto ocupado dentro da estrutura.

Exemplo: Cargo: Técnico de Recursos Humanos → Posições: Técnico RH 001, Técnico RH 002, Técnico RH 003.

**Conteúdo:** cargos, posições, departamento, unidade, superior hierárquico, nível hierárquico, família profissional, faixa salarial, número de posições, posições ocupadas, posições disponíveis, estado.

### Modal: Nova Posição

Cargo, código da posição, unidade, departamento, localização, superior hierárquico, posição do superior, centro de custo, tipo de posição, nível hierárquico, ocupante, data de abertura, data de ocupação, estado, posição crítica, posição elegível para sucessão, observações.

## 6. Organograma

```
Grupo/Empresa → Unidade → Departamento → Subdepartamento → Gestor → Colaboradores
```

**Deve permitir:** expandir/recolher, pesquisar colaborador, pesquisar departamento, pesquisar cargo, filtrar por unidade, por departamento, por nível hierárquico, visualizar gestor, visualizar equipa, abrir perfil do colaborador, abrir departamento, exportar organograma, imprimir organograma.

**Visualização por pessoa:** Colaborador → Gestor direto → Gestor do gestor → Equipa direta → Equipa indireta.

## 7. Localizações

**Conteúdo:** localizações, país, província, município, cidade, endereço, código postal, unidade associada, departamentos associados, responsável, telefone, e-mail, estado.

### Modal: Nova Localização

Nome, código, tipo de localização, país, província, município, cidade, endereço, código postal, coordenadas, unidade, responsável, telefone, e-mail, estado, observações.

---

## Arquitetura final

**Organization:** Visão Geral | Estrutura Organizacional | Unidades | Departamentos | Cargos & Posições | Organograma | Localizações

**Relações:**

- Empresa → Unidade → Departamento → Posição → Colaborador
- Cargo → Posição
- Gestor → Equipa
- Localização → Unidade/Departamento
- Centro de custo → Unidade/Departamento/Posição
