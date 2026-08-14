-- Shift templates now describe the shift label only. Actual work time is
-- calculated from employee_shifts.opened_at and employee_shifts.closed_at.

alter table public.shift_templates
  alter column start_time drop not null,
  alter column end_time drop not null;

alter table public.shift_templates disable trigger shift_templates_write_guard;

update public.shift_templates
set
  start_time = null,
  end_time = null,
  crosses_midnight = false,
  expected_duration_minutes = null,
  updated_at = now();

alter table public.shift_templates enable trigger shift_templates_write_guard;
