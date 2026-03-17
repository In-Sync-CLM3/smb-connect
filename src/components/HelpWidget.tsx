import { useEffect } from 'react';
import { useRoleContext } from '@/contexts/RoleContext';

export const HelpWidget = () => {
  const { selectedRole, availableRoles } = useRoleContext();
  const isAdmin =
    selectedRole === 'admin' ||
    selectedRole === 'god-admin' ||
    availableRoles?.isAdmin ||
    availableRoles?.isGodAdmin;

  useEffect(() => {
    if (!isAdmin) {
      // Clean up if role changes away from admin
      const el = document.getElementById('help-widget-script');
      if (el) el.remove();
      const widget = document.querySelector('[data-help-widget]');
      if (widget) widget.remove();
      return;
    }

    const existingScript = document.getElementById('help-widget-script');
    if (existingScript) return;

    const script = document.createElement('script');
    script.id = 'help-widget-script';
    script.src = 'https://crm.in-sync.co.in/help-widget.js';
    script.setAttribute('data-source', 'smb-connect');
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
