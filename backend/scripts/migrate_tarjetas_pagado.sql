-- Campo "pagado" persistido en conceptos de tarjeta de credito
ALTER TABLE tarjeta_conceptos
    ADD COLUMN IF NOT EXISTS pagado BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ix_tarjeta_conceptos_pagado
    ON tarjeta_conceptos(pagado) WHERE pagado = true;
