-- database: /data/open-teamwork.sqlite

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- ==========================================
-- 1. USUÁRIOS PLACEHOLDER
-- Senha de todos: 123456
-- ==========================================

INSERT OR IGNORE INTO user (email, password_hash)
VALUES
('placeholder1@open-teamwork.local', '$2a$12$13Uf4nyY6dhrbR3oIB1bMuyUQFMGLhPUXHGUzIxO7SszKLBtzX2ju'),
('placeholder2@open-teamwork.local', '$2a$12$13Uf4nyY6dhrbR3oIB1bMuyUQFMGLhPUXHGUzIxO7SszKLBtzX2ju'),
('placeholder3@open-teamwork.local', '$2a$12$13Uf4nyY6dhrbR3oIB1bMuyUQFMGLhPUXHGUzIxO7SszKLBtzX2ju'),
('placeholder4@open-teamwork.local', '$2a$12$13Uf4nyY6dhrbR3oIB1bMuyUQFMGLhPUXHGUzIxO7SszKLBtzX2ju'),
('placeholder5@open-teamwork.local', '$2a$12$13Uf4nyY6dhrbR3oIB1bMuyUQFMGLhPUXHGUzIxO7SszKLBtzX2ju'),
('placeholder6@open-teamwork.local', '$2a$12$13Uf4nyY6dhrbR3oIB1bMuyUQFMGLhPUXHGUzIxO7SszKLBtzX2ju');


-- ==========================================
-- 2. ATUALIZAR SENHAS DOS PLACEHOLDERS EXISTENTES
-- ==========================================

UPDATE user
SET password_hash = '$2a$12$13Uf4nyY6dhrbR3oIB1bMuyUQFMGLhPUXHGUzIxO7SszKLBtzX2ju'
WHERE email LIKE 'placeholder%@open-teamwork.local';


-- ==========================================
-- 3. PERFIS PLACEHOLDER
-- ==========================================

INSERT OR IGNORE INTO profile (id, name, contact_email, bio, github_url)
SELECT
    id,
    CASE email
        WHEN 'placeholder1@open-teamwork.local' THEN 'João Silva'
        WHEN 'placeholder2@open-teamwork.local' THEN 'Mariana Souza'
        WHEN 'placeholder3@open-teamwork.local' THEN 'Pedro Oliveira'
        WHEN 'placeholder4@open-teamwork.local' THEN 'Ana Pereira'
        WHEN 'placeholder5@open-teamwork.local' THEN 'Lucas Santos'
        WHEN 'placeholder6@open-teamwork.local' THEN 'Sofia Rodrigues'
    END,
    email,
    'Usuário placeholder para demonstração do Open Teamwork.',
    NULL
FROM user
WHERE email LIKE 'placeholder%@open-teamwork.local';


-- ==========================================
-- 4. PROJETOS
-- ==========================================

INSERT OR IGNORE INTO project (id, user_id, name, description, url, tags)
VALUES
(
    1001,
    (SELECT id FROM user WHERE email = 'placeholder1@open-teamwork.local'),
    'Open United Campus Platform',
    'Plataforma colaborativa para universidades, conectando estudantes a projetos open-source com times multidisciplinares.',
    'https://github.com/OpenUC/open-united-campus',
    '["JavaScript","TypeScript","React","Node.js","Express","PostgreSQL","Docker","Education","Open Source","Collaboration","Web"]'
),
(
    1002,
    (SELECT id FROM user WHERE email = 'placeholder2@open-teamwork.local'),
    'ML Research Toolkit',
    'Toolkit para pesquisa em Machine Learning com pipelines, notebooks e modelos pré-treinados.',
    'https://github.com/ai-lab/ml-research-toolkit',
    '["Python","PyTorch","TensorFlow","MLOps","Notebooks","Pipelines","Data"]'
),
(
    1003,
    (SELECT id FROM user WHERE email = 'placeholder3@open-teamwork.local'),
    'Smart Greenhouse IoT',
    'Monitoramento e automação de estufas com sensores, ESP32, MQTT e painel web em tempo real.',
    'https://github.com/agritech/smart-greenhouse',
    '["IoT","Embedded","ESP32","MQTT","AWS","Sensors","Agriculture","Edge","Dashboard"]'
),
(
    1004,
    (SELECT id FROM user WHERE email = 'placeholder4@open-teamwork.local'),
    'Mobile Health Tracker',
    'Aplicativo de saúde com Flutter, integração BLE com wearables e backend em Go.',
    'https://github.com/health-tech/mobile-health-tracker',
    '["Flutter","Dart","Android","iOS","Go","REST API","Health","Wearables","BLE","Security"]'
),
(
    1005,
    (SELECT id FROM user WHERE email = 'placeholder5@open-teamwork.local'),
    'FinPay Payments API',
    'API de pagamentos com NestJS, PostgreSQL e Kafka, focada em segurança e escalabilidade.',
    'https://github.com/finpay/finpay-payments-api',
    '["TypeScript","Node.js","NestJS","PostgreSQL","Redis","Kafka","Kubernetes","CI/CD","Payments","FinTech","Security"]'
),
(
    1006,
    (SELECT id FROM user WHERE email = 'placeholder6@open-teamwork.local'),
    'Open Maps Visualization Portal',
    'Portal de visualização de dados abertos com mapas interativos (Leaflet/Mapbox) e gráficos em D3.js.',
    'https://github.com/geo-open/open-maps-portal',
    '["Maps","GIS","Leaflet","Mapbox","D3.js","PostGIS","GeoServer","Accessibility","Open Data","Visualization"]'
);


-- ==========================================
-- 5. QUALIFICAÇÕES DO PROJETO 1001
-- ==========================================

INSERT OR IGNORE INTO project_qualification
(id, project_id, name, total_slots, filled_slots)
VALUES
(1, 1001, 'Desenvolvedor Frontend React', 3, 1),
(2, 1001, 'Desenvolvedor Backend Node.js', 3, 1),
(3, 1001, 'Designer UI/UX', 2, 0),
(4, 1001, 'Engenheiro DevOps', 1, 0),
(5, 1001, 'Engenheiro de QA', 1, 0),
(6, 1001, 'Gerente de Comunidade', 1, 1),
(7, 1001, 'Mentor Fullstack', 1, 1);


-- ==========================================
-- 6. QUALIFICAÇÕES DO PROJETO 1002
-- ==========================================

INSERT OR IGNORE INTO project_qualification
(id, project_id, name, total_slots, filled_slots)
VALUES
(1, 1002, 'Desenvolvedor Python', 3, 2),
(2, 1002, 'Engenheiro de ML', 2, 1),
(3, 1002, 'Cientista de Dados', 2, 0),
(4, 1002, 'Engenheiro MLOps', 1, 0),
(5, 1002, 'Líder de Documentação', 1, 1),
(6, 1002, 'Mantenedor de Infraestrutura', 1, 1);


-- ==========================================
-- 7. QUALIFICAÇÕES DO PROJETO 1003
-- ==========================================

INSERT OR IGNORE INTO project_qualification
(id, project_id, name, total_slots, filled_slots)
VALUES
(1, 1003, 'Engenheiro Embarcado (C/C++)', 2, 1),
(2, 1003, 'Desenvolvedor de Firmware (ESP32)', 1, 0),
(3, 1003, 'Engenheiro Cloud (AWS IoT)', 1, 0),
(4, 1003, 'Desenvolvedor Frontend Dashboard', 2, 0),
(5, 1003, 'Analista de Dados', 1, 0),
(6, 1003, 'Arquiteto de Hardware', 1, 1),
(7, 1003, 'Testador de Campo', 2, 2);


-- ==========================================
-- 8. QUALIFICAÇÕES DO PROJETO 1004
-- ==========================================

INSERT OR IGNORE INTO project_qualification
(id, project_id, name, total_slots, filled_slots)
VALUES
(1, 1004, 'Desenvolvedor Flutter', 2, 1),
(2, 1004, 'Desenvolvedor de API Backend (Go)', 1, 0),
(3, 1004, 'Engenheiro de QA Mobile', 1, 0),
(4, 1004, 'Pesquisador de UX', 1, 0),
(5, 1004, 'Engenheiro de Segurança', 1, 0),
(6, 1004, 'Especialista em Conformidade (LGPD)', 1, 1),
(7, 1004, 'Líder de Testes Beta', 1, 1);


-- ==========================================
-- 9. QUALIFICAÇÕES DO PROJETO 1005
-- ==========================================

INSERT OR IGNORE INTO project_qualification
(id, project_id, name, total_slots, filled_slots)
VALUES
(1, 1005, 'Desenvolvedor Backend (TypeScript/NestJS)', 3, 1),
(2, 1005, 'Engenheiro de Segurança (OWASP)', 1, 0),
(3, 1005, 'Administrador de Banco de Dados (PostgreSQL)', 1, 0),
(4, 1005, 'DevOps (Kubernetes)', 1, 0),
(5, 1005, 'Redator Técnico', 1, 0),
(6, 1005, 'Líder SRE', 1, 1),
(7, 1005, 'Oficial de Conformidade PCI', 1, 1);


-- ==========================================
-- 10. QUALIFICAÇÕES DO PROJETO 1006
-- ==========================================

INSERT OR IGNORE INTO project_qualification
(id, project_id, name, total_slots, filled_slots)
VALUES
(1, 1006, 'Visualização de Dados Frontend (D3.js)', 2, 1),
(2, 1006, 'Especialista em GIS', 1, 0),
(3, 1006, 'Backend GeoServer/PostGIS', 1, 0),
(4, 1006, 'Especialista em Acessibilidade', 1, 0),
(5, 1006, 'Redator de Conteúdo', 1, 0),
(6, 1006, 'Designer de Mapas (Cartografia)', 1, 1),
(7, 1006, 'Curador de Dados Abertos', 2, 2);


-- ==========================================
-- 11. VERIFICAÇÃO DOS PROJETOS
-- ==========================================

SELECT
    p.id,
    p.name AS project_name,
    pr.name AS owner_name,
    p.user_id,
    COUNT(q.id) AS total_qualifications
FROM project p
LEFT JOIN profile pr
    ON pr.id = p.user_id
LEFT JOIN project_qualification q
    ON q.project_id = p.id
WHERE p.id BETWEEN 1001 AND 1006
GROUP BY p.id, p.name, pr.name, p.user_id
ORDER BY p.id;


-- ==========================================
-- 12. VERIFICAÇÃO DAS VAGAS
-- ==========================================

SELECT
    p.name AS project_name,
    q.name AS qualification,
    q.filled_slots,
    q.total_slots,
    (q.total_slots - q.filled_slots) AS available_slots
FROM project p
JOIN project_qualification q
    ON q.project_id = p.id
WHERE p.id BETWEEN 1001 AND 1006
ORDER BY p.id, q.id;


COMMIT;