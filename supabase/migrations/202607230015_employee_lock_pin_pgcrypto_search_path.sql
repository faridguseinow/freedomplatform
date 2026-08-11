-- Make employee PIN RPCs see pgcrypto functions in existing databases.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter function public.set_employee_lock_pin(uuid, text)
  set search_path = public, extensions;

alter function public.request_employee_lock_pin_change(uuid, text)
  set search_path = public, extensions;

alter function public.verify_employee_lock_pin(uuid, text)
  set search_path = public, extensions;
