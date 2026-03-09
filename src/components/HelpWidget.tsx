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
    script.src = 'https://go-in-sync.lovable.app/help-widget.js';
    script.setAttribute('data-source', 'smb_connect');
    document.body.appendChild(script);

    return () => {
      const el = document.getElementById('help-widget-script');
      if (el) el.remove();
      // Clean up any widget DOM the script may have created
      const widget = document.querySelector('[data-help-widget]');
      if (widget) widget.remove();
    };
  }, [isAdmin]);

  return null;
};
