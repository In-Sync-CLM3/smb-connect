import { useEffect } from 'react';
import { useRoleContext } from '@/contexts/RoleContext';

export const HelpWidget = () => {
  const { selectedRole, availableRoles } = useRoleContext();
  const isAdmin = selectedRole === 'admin' || selectedRole === 'god-admin' || availableRoles?.isAdmin;

  useEffect(() => {
    // Remove any existing widget elements first
    const existingScript = document.getElementById('help-widget-script');
    if (existingScript) existingScript.remove();
    const existingWidget = document.querySelector('[data-help-widget], .help-widget-container, iframe[src*="help-widget"]');
    if (existingWidget) existingWidget.remove();

    if (!isAdmin) return;

    const script = document.createElement('script');
    script.id = 'help-widget-script';
    script.src = 'https://go-in-sync.lovable.app/help-widget.js';
    script.setAttribute('data-source', 'smb_connect');
    document.body.appendChild(script);

    return () => {
      const el = document.getElementById('help-widget-script');
      if (el) el.remove();
      const widget = document.querySelector('[data-help-widget], .help-widget-container, iframe[src*="help-widget"]');
      if (widget) widget.remove();
    };
  }, [isAdmin]);

  return null;
};
