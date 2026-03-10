import { useEffect } from 'react';
import { useRoleContext } from '@/contexts/RoleContext';

export const HelpWidget = () => {
  const { selectedRole } = useRoleContext();
  const isAdmin = selectedRole === 'admin' || selectedRole === 'god-admin';

  useEffect(() => {
    if (!isAdmin) return;

    const existingScript = document.getElementById('help-widget-script');
    if (existingScript) return;

    const script = document.createElement('script');
    script.id = 'help-widget-script';
    script.src = 'https://go.in-sync.co.in/help-widget.js';
    script.setAttribute('data-source', 'paisaa_saarthi');
    document.body.appendChild(script);

    return () => {
      const el = document.getElementById('help-widget-script');
      if (el) el.remove();
      const widget = document.querySelector('[data-help-widget]');
      if (widget) widget.remove();
    };
  }, [isAdmin]);

  return null;
};
