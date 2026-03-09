import { useEffect } from 'react';
import { useRoleContext } from '@/contexts/RoleContext';

const WIDGET_STYLE_ID = 'help-widget-style';

const widgetCSS = `
  #help-widget-container,
  [data-help-widget],
  .help-widget-container {
    max-height: 400px !important;
    height: 400px !important;
    aspect-ratio: 16 / 9 !important;
    border-radius: 12px !important;
    overflow: hidden !important;
  }
  #help-widget-container iframe,
  [data-help-widget] iframe,
  .help-widget-container iframe {
    max-height: 400px !important;
    height: 100% !important;
    width: 100% !important;
    border-radius: 12px !important;
  }
`;

export const HelpWidget = () => {
  const { selectedRole, availableRoles } = useRoleContext();
  const isAdmin = selectedRole === 'admin' || selectedRole === 'god-admin' || availableRoles?.isAdmin;

  useEffect(() => {
    // Remove any existing widget elements first
    const existingScript = document.getElementById('help-widget-script');
    if (existingScript) existingScript.remove();
    const existingStyle = document.getElementById(WIDGET_STYLE_ID);
    if (existingStyle) existingStyle.remove();
    const existingWidget = document.querySelector('[data-help-widget], .help-widget-container, iframe[src*="help-widget"]');
    if (existingWidget) existingWidget.remove();

    if (!isAdmin) return;

    // Inject CSS to constrain widget to YouTube-like dimensions
    const style = document.createElement('style');
    style.id = WIDGET_STYLE_ID;
    style.textContent = widgetCSS;
    document.head.appendChild(style);

    const script = document.createElement('script');
    script.id = 'help-widget-script';
    script.src = 'https://go-in-sync.lovable.app/help-widget.js';
    script.setAttribute('data-source', 'smb_connect');
    document.body.appendChild(script);

    return () => {
      const el = document.getElementById('help-widget-script');
      if (el) el.remove();
      const st = document.getElementById(WIDGET_STYLE_ID);
      if (st) st.remove();
      const widget = document.querySelector('[data-help-widget], .help-widget-container, iframe[src*="help-widget"]');
      if (widget) widget.remove();
    };
  }, [isAdmin]);

  return null;
};
