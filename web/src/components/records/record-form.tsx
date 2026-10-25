import * as React from 'react';
import { Controller, useForm, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodTypeAny } from 'zod';
import { labelize, type CustomField } from '@crm/shared';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { EntityPicker, TagInput, UserSelect, type PickerEntity } from './pickers';
import { useCustomFields, useMe, usePipelines } from '@/hooks/data';
import { ApiError } from '@/lib/api';
import { cn, toDateInput, toDateTimeInput } from '@/lib/utils';

export type FieldDef = { name: string; label: string; required?: boolean; span?: 2; hint?: string; placeholder?: string } & (
  | { type: 'text' | 'email' | 'tel' | 'number' | 'date' | 'datetime' | 'textarea' }
  | { type: 'select'; options: readonly string[] | { value: string; label: string }[]; allowEmpty?: string }
  | { type: 'user'; allowEmpty?: string }
  | { type: 'entity'; entity: PickerEntity; labelFrom?: string }
  | { type: 'tags' }
  | { type: 'checkbox' }
  | { type: 'currency' }
  | { type: 'pipelineStage' }
);

/** Convert a record into form-ready values (dates → input strings, tags → names). */
export function toFormValues(fields: FieldDef[], record: Record<string, any> | undefined, extra: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = { ...extra };
  for (const f of fields) {
    const v = record?.[f.name];
    if (f.type === 'date') out[f.name] = toDateInput(v);
    else if (f.type === 'datetime') out[f.name] = toDateTimeInput(v);
    else if (f.type === 'tags') out[f.name] = (v ?? []).map((t: { name: string } | string) => (typeof t === 'string' ? t : t.name));
    else if (f.type === 'checkbox') out[f.name] = v ?? out[f.name] ?? false;
    else if (f.type === 'pipelineStage') { out.pipelineId = record?.pipelineId ?? out.pipelineId ?? ''; out.stageId = record?.stageId ?? out.stageId ?? ''; }
    else if (v !== undefined) out[f.name] = v ?? '';
    else if (!(f.name in out)) out[f.name] = '';
  }
  if (record?.customFields) out.customFields = record.customFields;
  return out;
}

function PipelineStageInputs({ control, setValue, watch, errors }: any) {
  const { data: pipelines = [] } = usePipelines();
  const pipelineId: string = watch('pipelineId');
  const stageId: string = watch('stageId');
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];
  // Keep pipeline/stage valid: a prefilled pipeline without a stage (or a stale
  // stage) snaps to the pipeline's first stage, so the select never shows a
  // value the form doesn't actually hold.
  React.useEffect(() => {
    if (!pipelines.length) return;
    const p = pipelines.find((x) => x.id === pipelineId);
    if (!p) { setValue('pipelineId', pipelines[0].id); setValue('stageId', pipelines[0].stages[0]?.id ?? ''); return; }
    if (!p.stages.some((s) => s.id === stageId)) setValue('stageId', p.stages[0]?.id ?? '');
  }, [pipelineId, stageId, pipelines, setValue]);
  return (
    <>
      <Field label="Pipeline" required error={errors.pipelineId?.message}>
        <Controller control={control} name="pipelineId" render={({ field }) => (
          <Select {...field} onChange={(e) => { field.onChange(e.target.value); setValue('stageId', pipelines.find((p) => p.id === e.target.value)?.stages[0]?.id ?? ''); }}>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )} />
      </Field>
      <Field label="Stage" required error={errors.stageId?.message}>
        <Controller control={control} name="stageId" render={({ field }) => (
          <Select {...field}>{pipeline?.stages.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.probability}%)</option>)}</Select>
        )} />
      </Field>
    </>
  );
}

function CustomFieldInput({ def, control }: { def: CustomField; control: any }) {
  return (
    <Controller control={control} name={`customFields.${def.key}`} render={({ field }) => {
      const value = field.value ?? (def.type === 'checkbox' ? false : '');
      if (def.type === 'checkbox') return <div className="flex h-9 items-center"><Checkbox checked={!!value} onCheckedChange={(c) => field.onChange(!!c)} aria-label={def.label} /></div>;
      if (def.type === 'select') return <Select value={value} onChange={field.onChange}><option value="">—</option>{def.options.map((o) => <option key={o}>{o}</option>)}</Select>;
      return <Input type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'} value={value} onChange={field.onChange} />;
    }} />
  );
}

export function RecordFormDialog({
  open, onOpenChange, title, description, schema, fields, defaultValues, onSubmit, submitLabel = 'Save', customFieldEntity, size = 'lg', children,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; schema: ZodTypeAny; fields: FieldDef[];
  defaultValues: Record<string, unknown>; onSubmit: (values: any) => Promise<unknown>; submitLabel?: string;
  customFieldEntity?: string; size?: 'md' | 'lg' | 'xl'; children?: React.ReactNode;
}) {
  const { data: me } = useMe();
  const { data: customFields } = useCustomFields(customFieldEntity ?? '__none');
  const form = useForm<FieldValues>({ resolver: zodResolver(schema), defaultValues });
  const { control, register, handleSubmit, formState: { errors, isSubmitting }, reset, setError } = form;
  React.useEffect(() => { if (open) reset(defaultValues); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        Object.entries(err.fields).forEach(([k, m]) => setError(k, { message: m }));
        if (!Object.keys(err.fields).length) setError('root', { message: err.message });
      } else setError('root', { message: 'Something went wrong' });
    }
  });

  const err = (name: string) => (errors[name]?.message as string | undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} size={size}>
        <form onSubmit={submit} noValidate>
          {errors.root && <div role="alert" className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{String(errors.root.message)}</div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => {
              if (f.type === 'pipelineStage') return <PipelineStageInputs key={f.name} {...form} errors={errors} />;
              const cls = cn((f.span === 2 || f.type === 'textarea' || f.type === 'tags') && 'sm:col-span-2');
              const fid = `fld-${f.name}`;
              let control_: React.ReactElement;
              switch (f.type) {
                case 'textarea': control_ = <Textarea rows={4} placeholder={f.placeholder} {...register(f.name)} />; break;
                case 'select':
                  control_ = (
                    <Select {...register(f.name)}>
                      {f.allowEmpty !== undefined && <option value="">{f.allowEmpty}</option>}
                      {f.options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{labelize(o)}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  );
                  break;
                case 'currency':
                  control_ = <Select {...register(f.name)}>{(me?.org.currencies ?? ['USD']).map((c) => <option key={c}>{c}</option>)}</Select>;
                  break;
                case 'user':
                  control_ = <Controller control={control} name={f.name} render={({ field }) => <UserSelect id={fid} value={field.value} onChange={field.onChange} allowEmpty={f.allowEmpty} />} />;
                  break;
                case 'entity':
                  control_ = <Controller control={control} name={f.name} render={({ field }) => (
                    <EntityPicker id={fid} entity={f.entity} value={field.value || null} onChange={field.onChange} initialLabel={f.labelFrom ? (defaultValues[f.labelFrom] as string) : undefined} />
                  )} />;
                  break;
                case 'tags':
                  control_ = <Controller control={control} name={f.name} render={({ field }) => <TagInput id={fid} value={field.value ?? []} onChange={field.onChange} />} />;
                  break;
                case 'checkbox':
                  control_ = <Controller control={control} name={f.name} render={({ field }) => (
                    <div className="flex h-9 items-center gap-2"><Checkbox checked={!!field.value} onCheckedChange={(c) => field.onChange(!!c)} aria-label={f.label} /></div>
                  )} />;
                  break;
                default:
                  control_ = <Input type={f.type === 'datetime' ? 'datetime-local' : f.type} step={f.type === 'number' ? 'any' : undefined} placeholder={f.placeholder} {...register(f.name)} />;
              }
              return <Field key={f.name} htmlFor={fid} label={f.label} required={f.required} hint={f.hint} error={err(f.name)} className={cls}>{control_}</Field>;
            })}
            {customFields.map((cf) => (
              <Field key={cf.id} label={cf.label} required={cf.required} error={(errors.customFields as any)?.[cf.key]?.message}>
                <CustomFieldInput def={cf} control={control} />
              </Field>
            ))}
          </div>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
