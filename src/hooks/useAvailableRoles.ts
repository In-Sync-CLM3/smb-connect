import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AvailableRoles } from '@/contexts/RoleContext';

export function useAvailableRoles() {
  const [availableRoles, setAvailableRoles] = useState<AvailableRoles | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAvailableRoles();
  }, []);

  const loadAvailableRoles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAvailableRoles(null);
        setLoading(false);
        return;
      }

      const roles: AvailableRoles = {
        isAdmin: false,
        isSuperAdmin: false,
        isPlatformAdmin: false,
        associations: [],
        companies: [],
        isMember: false,
      };

      // Check admin status
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('is_super_admin, is_hidden')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (adminData) {
        roles.isAdmin = true;
        roles.isSuperAdmin = adminData.is_super_admin || false;
        roles.isPlatformAdmin = adminData.is_super_admin && (adminData as any).is_hidden === true;
      }

      // Check association manager roles
      // Admins get access to ALL associations for troubleshooting
      if (roles.isAdmin) {
        const { data: allAssociations } = await supabase
          .from('associations')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        if (allAssociations && allAssociations.length > 0) {
          roles.associations = allAssociations;
        }
      } else {
        const { data: associationManagers } = await supabase
          .from('association_managers')
          .select('association_id, association:associations(id, name)')
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (associationManagers && associationManagers.length > 0) {
          roles.associations = associationManagers
            .filter(am => am.association)
            .map(am => ({
              id: (am.association as any).id,
              name: (am.association as any).name,
            }));
        }
      }

      // Check company admin roles
      // Admins get access to ALL companies for troubleshooting
      if (roles.isAdmin) {
        const { data: allCompanies } = await supabase
          .from('companies')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        if (allCompanies && allCompanies.length > 0) {
          roles.companies = allCompanies.map(c => ({
            id: c.id,
            name: c.name,
            role: 'admin' as const,
          }));
        }
      } else {
        const { data: companyAdmins } = await supabase
          .from('members')
          .select('company_id, role, company:companies(id, name)')
          .eq('user_id', user.id)
          .in('role', ['owner', 'admin'])
          .eq('is_active', true);

        if (companyAdmins && companyAdmins.length > 0) {
          roles.companies = companyAdmins
            .filter(ca => ca.company)
            .map(ca => ({
              id: (ca.company as any).id,
              name: (ca.company as any).name,
              role: ca.role as 'owner' | 'admin',
            }));
        }
      }

      // Check member status - all users with a member record can access member features
      const { data: memberDataArr, error: memberError } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1);

      if (memberError) {
        console.error('Error checking member status:', memberError);
      }

      roles.isMember = !!(memberDataArr && memberDataArr.length > 0);
      
      // If user is an admin but also has a member record, ensure isMember is true
      // This ensures admins can still access member features
      if (!roles.isMember && roles.isAdmin) {
        // Double-check with a broader query for admins
        const { data: adminMemberCheck } = await supabase
          .from('members')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        
        roles.isMember = !!(adminMemberCheck && adminMemberCheck.length > 0);
      }

      setAvailableRoles(roles);
      setLoading(false);
    } catch (error) {
      console.error('Error loading available roles:', error);
      setAvailableRoles(null);
      setLoading(false);
    }
  };

  return { availableRoles, loading, refreshRoles: loadAvailableRoles };
}
