import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/smb-connect-logo.jpg';

const resetPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  token: z.string().length(6, 'Verification code must be 6 digits').regex(/^\d+$/, 'Code must contain only numbers'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const prefilled = location.state?.email || '';
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: prefilled },
  });

  useEffect(() => {
    if (prefilled) {
      setValue('email', prefilled);
    }
  }, [prefilled, setValue]);

  const onSubmit = async (data: ResetPasswordFormData) => {
    try {
      setLoading(true);
      
      console.log('Verifying OTP and resetting password for:', data.email);
      
      // Call custom edge function to verify OTP and reset password
      const { data: result, error } = await supabase.functions.invoke('verify-password-otp', {
        body: {
          email: data.email,
          otp: data.token,
          newPassword: data.password
        }
      });

      if (error) {
        console.error('Password reset failed:', error);
        let serverMessage: string | null = null;
        try {
          const body = await (error as any).context?.json?.();
          serverMessage = body?.error || null;
        } catch {
          try {
            const text = await (error as any).context?.text?.();
            if (text) {
              const parsed = JSON.parse(text);
              serverMessage = parsed?.error || null;
            }
          } catch {}
        }
        throw new Error(serverMessage || 'Invalid or expired verification code');
      }

      console.log('Password reset successful');

      toast({
        title: 'Password Reset Successful!',
        description: 'Your password has been updated. Redirecting to login...',
      });

      // Redirect to login after brief delay
      setTimeout(() => {
        navigate('/auth/login');
      }, 2000);
    } catch (error: any) {
      console.error('Password reset error:', error);
      toast({
        title: 'Failed to Reset Password',
        description: error.message || 'Please check your verification code and try again, or request a new code from the login page.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <img src={logo} alt="SMB Connect" className="h-16 object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold">Reset Your Password</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your email and choose a new password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                {...register('email')}
                id="email"
                type="email"
                placeholder="you@example.com"
                disabled={!!prefilled || loading}
                autoComplete="email"
                className={prefilled ? "bg-muted" : ""}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="token">Verification Code</Label>
              <Input
                {...register('token')}
                id="token"
                type="text"
                placeholder="123456"
                maxLength={6}
                disabled={loading}
                className="text-center text-2xl tracking-widest font-mono"
                autoComplete="one-time-code"
              />
              {errors.token && (
                <p className="text-sm text-destructive">{errors.token.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Check your email for the 6-digit code. It should arrive within seconds via Resend. Check your spam folder if you don't see it.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                {...register('password')}
                id="password"
                type="password"
                placeholder="••••••••"
                disabled={loading}
                autoComplete="new-password"
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                {...register('confirmPassword')}
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                disabled={loading}
                autoComplete="new-password"
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Resetting Password...' : 'Reset Password'}
            </Button>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/auth/login')}
                className="w-full"
                disabled={loading}
              >
                Back to Login
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Didn't receive a code? Return to login and request a new one.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
