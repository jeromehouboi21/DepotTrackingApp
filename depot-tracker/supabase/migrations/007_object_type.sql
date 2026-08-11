-- =====================================================================
-- 007_object_type.sql - feinere Objekttyp-Klassifizierung (Aktie/ETF/Fonds/
-- Anleihe/Sonstige), getrennt von securities.asset_class (equity|fund_etf|
-- bond|other, verschmilzt ETF+Fonds - bleibt fuer den AllocationDonut
-- unangetastet). Additiv, zwei nullbare Spalten, kein Backfill noetig.
-- (Hinweisnummer im Design "006" ist durch 006_manual_transactions.sql
-- bereits belegt - naechste freie Nummer 007 verwendet.)
-- =====================================================================

alter table public.securities
  add column if not exists object_type       text,  -- manueller Override: stock|etf|fund|bond|other (null = ableiten)
  add column if not exists figi_security_type text;  -- roher OpenFIGI-Typ (securityType2), Cache aus resolve-symbols

comment on column public.securities.object_type is
  'Manueller Override der Objekttyp-Klassifizierung (stock|etf|fund|bond|other). null = automatisch aus figi_security_type/Name ableiten.';
comment on column public.securities.figi_security_type is
  'Roher OpenFIGI-Instrumententyp (securityType2, Fallback securityType), aus resolve-symbols gecacht.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'securities_object_type_chk'
  ) then
    alter table public.securities
      add constraint securities_object_type_chk
      check (object_type is null or object_type in ('stock','etf','fund','bond','other'));
  end if;
end$$;

-- Keine RLS-Aenderung noetig - bestehende securities_owner-Policy deckt die Spalten ab.
