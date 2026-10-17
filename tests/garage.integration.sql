-- Run in Supabase SQL Editor as postgres. All fixtures are rolled back; no emails are sent.
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
declare u uuid:=gen_random_uuid(); v uuid; c uuid; last_cycle uuid; d uuid; result jsonb;
  business_date date:=(now() at time zone 'America/New_York')::date;
begin
  insert into auth.users(id,email,raw_user_meta_data) values(u,u::text||'@example.invalid','{}');
  for n in 1..105 loop
    insert into public.garage_vehicles(customer_id,year,make,model) values(u,2024,'Test','Queue') returning id into v;
    result:=public.garage_record_service(v,(business_date-interval '4 months')::date,'Rollback fixture',null,true,false,false,false);
    c:=(result->>'cycle_id')::uuid;
    if n<105 then
      insert into public.garage_email_deliveries(cycle_id,message_type,status) values(c,'month3_due','sent');
    else last_cycle:=c; end if;
  end loop;
  if not exists(select 1 from public.garage_pending_reminders(200) where cycle_id=last_cycle) then raise exception 'Sent history starved pending reminder'; end if;
  d:=public.garage_claim_email_delivery(last_cycle,'month3_due');
  if d is null then raise exception 'Due delivery not claimed'; end if;
  if public.garage_claim_email_delivery(last_cycle,'month3_due') is not null then raise exception 'Duplicate claim'; end if;
  if exists(select 1 from public.garage_pending_reminders(200) where cycle_id=last_cycle) then raise exception 'Queued ambiguous delivery would retry'; end if;
  update public.garage_email_deliveries set status='failed' where id=d;
  if not exists(select 1 from public.garage_pending_reminders(200) where cycle_id=last_cycle) then raise exception 'Definite rejection cannot retry'; end if;
  result:=public.garage_record_service(v,business_date,'Fresh detail',null,true,false,false,false);
  if public.garage_claim_email_delivery(last_cycle,'month3_due') is not null then raise exception 'Superseded cycle claimed'; end if;
  c:=(result->>'cycle_id')::uuid;
  if public.garage_claim_email_delivery(c,'month1_offer') is not null then raise exception 'Early offer email claimed'; end if;
  perform public.garage_record_service(v,(business_date-interval '6 months')::date,'Historical detail',null,true,false,false,false);
  if not exists(select 1 from public.garage_maintenance_cycles where id=c and status='active') then raise exception 'Backdated history reset fresh cycle'; end if;
end; $$;
rollback;
select 'PASS: queue fairness, duplicate claims, uncertain outcomes, retryable rejections, inactive cycles, due dates and backdated history. All fixtures rolled back.' as verification;
