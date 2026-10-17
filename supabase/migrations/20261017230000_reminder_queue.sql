begin;

-- Only unsent or definitively rejected messages enter the daily queue.
create or replace function public.garage_pending_reminders(p_limit integer default 100)
returns table(cycle_id uuid,message_type text) language sql stable security definer set search_path=public
as $$
  select c.id, m.kind
  from public.garage_maintenance_cycles c
  cross join lateral (values ('month1_offer'::text,c.offer_date),('month3_due'::text,c.sealant_expires_at)) m(kind,due_on)
  left join public.garage_email_deliveries d on d.cycle_id=c.id and d.message_type=m.kind
  where auth.role()='service_role' and c.status='active'
    and m.due_on <= (now() at time zone 'America/New_York')::date
    and (m.kind='month3_due' or (c.offer_expires_at >= (now() at time zone 'America/New_York')::date
      and exists(select 1 from public.garage_offers o where o.cycle_id=c.id and o.status='available')))
    and (d.id is null or d.status='failed')
  order by m.due_on,c.id,m.kind limit greatest(1,least(p_limit,200));
$$;
revoke all on function public.garage_pending_reminders(integer) from public,anon,authenticated;
grant execute on function public.garage_pending_reminders(integer) to service_role;

create or replace function public.garage_claim_email_delivery(p_cycle_id uuid,p_message_type text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_status text; v_cycle public.garage_maintenance_cycles%rowtype;
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  if auth.role()<>'service_role' then raise exception 'Server authorization required'; end if;
  -- Same lock order as service completion; a reset cannot interleave with a claim.
  perform 1 from public.garage_vehicles where id=(select vehicle_id from public.garage_maintenance_cycles where id=p_cycle_id) for update;
  select * into v_cycle from public.garage_maintenance_cycles where id=p_cycle_id for update;
  if not found or v_cycle.status<>'active' then return null; end if;
  if p_message_type='month1_offer' then
    if v_cycle.offer_date>v_today or v_cycle.offer_expires_at<v_today
      or not exists(select 1 from public.garage_offers where cycle_id=p_cycle_id and status='available') then return null; end if;
  elsif p_message_type='month3_due' then
    if v_cycle.sealant_expires_at>v_today then return null; end if;
  else raise exception 'Invalid message type'; end if;
  insert into public.garage_email_deliveries(cycle_id,message_type,status)
    values(p_cycle_id,p_message_type,'queued') on conflict(cycle_id,message_type) do nothing returning id into v_id;
  if v_id is not null then return v_id; end if;
  select id,status into v_id,v_status from public.garage_email_deliveries where cycle_id=p_cycle_id and message_type=p_message_type for update;
  if not found or v_status<>'failed' then return null; end if;
  update public.garage_email_deliveries set status='queued',error=null,created_at=now() where id=v_id;
  return v_id;
end; $$;
revoke all on function public.garage_claim_email_delivery(uuid,text) from public,anon,authenticated;
grant execute on function public.garage_claim_email_delivery(uuid,text) to service_role;
create or replace function public.garage_record_service(
  p_vehicle_id uuid, p_service_date date, p_title text, p_description text,
  p_paint_sealant boolean, p_ceramic_coating boolean, p_leather_protection boolean, p_fabric_protection boolean
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_customer uuid; v_service uuid; v_cycle uuid; v_offer date; v_offer_end date; v_sealant_end date;
begin
  if auth.role() <> 'service_role' then raise exception 'Server authorization required'; end if;
  select customer_id into v_customer from public.garage_vehicles where id = p_vehicle_id for update;
  if v_customer is null then raise exception 'Vehicle not found'; end if;
  insert into public.garage_services(vehicle_id,service_date,title,description,paint_sealant,ceramic_coating,leather_protection,fabric_protection)
  values(p_vehicle_id,p_service_date,p_title,p_description,p_paint_sealant,p_ceramic_coating,p_leather_protection,p_fabric_protection) returning id into v_service;
  if p_service_date > (now() at time zone 'America/New_York')::date then raise exception 'Service date must be completed'; end if;
  if p_paint_sealant and not exists(select 1 from public.garage_maintenance_cycles where vehicle_id=p_vehicle_id and status='active' and applied_on>p_service_date) then
    update public.garage_maintenance_cycles set status='superseded' where vehicle_id=p_vehicle_id and status='active';
    update public.garage_offers set status='invalidated' where vehicle_id=p_vehicle_id and status in ('available','reserved');
    v_offer := (p_service_date + interval '1 month')::date;
    v_offer_end := (v_offer + interval '1 month')::date;
    v_sealant_end := (p_service_date + interval '3 months')::date;
    insert into public.garage_maintenance_cycles(vehicle_id,service_id,applied_on,offer_date,offer_expires_at,sealant_expires_at)
    values(p_vehicle_id,v_service,p_service_date,v_offer,v_offer_end,v_sealant_end) returning id into v_cycle;
    insert into public.garage_offers(cycle_id,vehicle_id,starts_on,expires_at) values(v_cycle,p_vehicle_id,v_offer,v_offer_end);
  end if;
  return jsonb_build_object('service_id',v_service,'customer_id',v_customer,'cycle_id',v_cycle,'offer_date',v_offer,'offer_expires_at',v_offer_end,'sealant_expires_at',v_sealant_end);
end; $$;
revoke all on function public.garage_record_service(uuid,date,text,text,boolean,boolean,boolean,boolean) from public, anon, authenticated;
grant execute on function public.garage_record_service(uuid,date,text,text,boolean,boolean,boolean,boolean) to service_role;

commit;
