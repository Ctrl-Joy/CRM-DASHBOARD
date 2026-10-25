import * as React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { COMPANY_SIZES, publicLeadSchema } from '@crm/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Card } from '@/components/ui/display';

/** Hosted lead-capture form: /f/:key posts to the public lead API. */
export function PublicLeadForm() {
  const { key = '' } = useParams();
  const [done, setDone] = React.useState(false);
  const { data, isError } = useQuery({ queryKey: ['form', key], queryFn: () => api.get<{ organization: string }>(`/public/forms/${key}`), retry: false });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(publicLeadSchema) });
  const submit = handleSubmit(async (v) => {
    try { await api.post(`/public/leads/${key}`, v); setDone(true); } catch (e) { setError('root', { message: (e as Error).message }); }
  });
  if (isError) return <p className="p-10 text-center text-muted-foreground">This form is no longer available.</p>;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-lg p-6 sm:p-8">
        {done ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto size-10 text-success" />
            <p className="mt-3 text-lg font-semibold">Thanks — we'll be in touch shortly.</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold">Talk to {data?.organization ?? '…'}</h1>
              <p className="text-sm text-muted-foreground">Leave your details and the right person will reach out.</p>
            </div>
            {errors.root && <p role="alert" className="text-sm text-destructive">{String(errors.root.message)}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" required error={errors.firstName?.message as string}><Input {...register('firstName')} /></Field>
              <Field label="Last name"><Input {...register('lastName')} /></Field>
              <Field label="Work email" required error={errors.email?.message as string}><Input type="email" {...register('email')} /></Field>
              <Field label="Phone"><Input type="tel" {...register('phone')} /></Field>
              <Field label="Company"><Input {...register('companyName')} /></Field>
              <Field label="Job title"><Input {...register('title')} /></Field>
              <Field label="Company size" className="sm:col-span-2">
                <Select {...register('companySize')}><option value="">—</option>{COMPANY_SIZES.map((s) => <option key={s}>{s}</option>)}</Select>
              </Field>
              <Field label="How can we help?" className="sm:col-span-2"><Textarea {...register('message')} /></Field>
            </div>
            <Button type="submit" className="w-full" loading={isSubmitting}>Submit</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
