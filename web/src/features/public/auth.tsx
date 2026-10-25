import * as React from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMe } from '@/hooks/data';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { loginSchema, signupSchema, type LoginInput, type SignupInput } from '@crm/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r bg-secondary/60 p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 top-1/4 size-96 rounded-full bg-accent/20 blur-3xl" aria-hidden />
        <Link to="/" className="relative text-xl font-semibold tracking-tight text-foreground"><span className="text-accent">✦</span> Nexora</Link>
        <div className="relative">
          <h2 className="max-w-md font-display text-5xl leading-[0.95] tracking-tight">A CRM that tells you <em>what to do next.</em></h2>
          <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
            {['Next-best-action recommendations on every screen', 'Visual pipeline with weighted forecasting', 'Contacts, deals, tickets and campaigns in one place'].map((t) => (
              <li key={t} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-accent" />{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-muted-foreground">© {new Date().getFullYear()} Nexora</p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 block text-xl font-semibold tracking-tight lg:hidden"><span className="text-accent">✦</span> Nexora</Link>
          <h1 className="font-display text-4xl tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
        </div>
      </main>
    </div>
  );
}

function useAuthSubmit<T extends Record<string, unknown>>(path: string, setError: (k: any, e: { message: string }) => void) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  return async (values: T) => {
    try {
      await api.post(path, values);
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate((location.state as { from?: string } | null)?.from ?? '/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) Object.entries(err.fields).forEach(([k, m]) => setError(k, { message: m }));
      else setError('root', { message: (err as Error).message });
    }
  };
}

export function LoginPage() {
  const { data: me } = useMe();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const submit = useAuthSubmit<LoginInput>('/auth/login', setError);
  if (me) return <Navigate to="/dashboard" replace />;
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your workspace." footer={<>New to Nexora?<Link to="/signup" className="font-medium text-primary hover:underline">Create an account</Link></>}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        {errors.root && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errors.root.message}</p>}
        <Field label="Work email" error={errors.email?.message}><Input type="email" autoComplete="email" autoFocus {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Sign in</Button>
      </form>
    </AuthLayout>
  );
}

export function SignupPage() {
  const location = useLocation();
  const prefill = (location.state as Partial<SignupInput> | null) ?? {};
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<SignupInput>({ resolver: zodResolver(signupSchema), defaultValues: prefill });
  const submit = useAuthSubmit<SignupInput>('/auth/signup', setError);
  const { data: me } = useMe();
  if (me) return <Navigate to="/dashboard" replace />;
  return (
    <AuthLayout title="Create your workspace" subtitle="You'll start with a clean, empty CRM — no sample data." footer={<>Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link></>}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        {errors.root && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errors.root.message}</p>}
        <Field label="Full name" error={errors.name?.message}><Input autoComplete="name" autoFocus {...register('name')} /></Field>
        <Field label="Company" error={errors.company?.message}><Input autoComplete="organization" {...register('company')} /></Field>
        <Field label="Work email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label="Password" hint="At least 8 characters" error={errors.password?.message}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Create account</Button>
        <p className="text-center text-xs text-muted-foreground">You'll be the admin of your new organization and can invite your team from Settings.</p>
      </form>
    </AuthLayout>
  );
}
