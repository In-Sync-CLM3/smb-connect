import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate a secure random password
function generatePassword(length: number = 12): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  const allChars = lowercase + uppercase + numbers + symbols;
  
  let password = '';
  // Ensure at least one of each type
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Format date as "20 February 2026"
function formatEventDate(dateString: string | null): string {
  if (!dateString) return 'Details to be announced';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  } catch {
    return 'Details to be announced';
  }
}

interface RegistrationRequest {
  landing_page_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  registration_data?: Record<string, unknown>;
  coupon_code?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body: RegistrationRequest = await req.json();
    const { landing_page_id, email, first_name, last_name, phone, registration_data, coupon_code, utm_source, utm_medium, utm_campaign } = body;

    // Validate required fields
    if (!landing_page_id || !email || !first_name || !last_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: landing_page_id, email, first_name, last_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the landing page exists and has registration enabled
    const { data: landingPage, error: pageError } = await supabase
      .from('event_landing_pages')
      .select(`
        id,
        title,
        registration_enabled,
        registration_fee,
        association_id,
        event_date,
        event_time,
        event_venue,
        default_utm_source,
        default_utm_medium,
        default_utm_campaign,
        associations (
          name
        )
      `)
      .eq('id', landing_page_id)
      .eq('is_active', true)
      .single();

    if (pageError || !landingPage) {
      console.error('Landing page not found:', pageError);
      return new Response(
        JSON.stringify({ error: 'Landing page not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!landingPage.registration_enabled) {
      return new Response(
        JSON.stringify({ error: 'Registration is not enabled for this event' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if email is already registered for this event
    const { data: existingReg } = await supabase
      .from('event_registrations')
      .select('id')
      .eq('landing_page_id', landing_page_id)
      .eq('email', email.toLowerCase())
      .single();

    if (existingReg) {
      return new Response(
        JSON.stringify({ error: 'This email is already registered for this event' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get registration fee and calculate amounts
    const registrationFee = parseFloat(landingPage.registration_fee) || 0;
    let originalAmount = registrationFee;
    let discountAmount = 0;
    let finalAmount = registrationFee;
    let couponId: string | null = null;

    // Validate and process coupon if provided
    if (coupon_code) {
      const normalizedCode = coupon_code.toUpperCase().trim();
      
      // Fetch and validate coupon
      const { data: coupon, error: couponError } = await supabase
        .from('event_coupons')
        .select('*')
        .eq('code', normalizedCode)
        .single();

      if (couponError || !coupon) {
        return new Response(
          JSON.stringify({ error: 'Invalid coupon code' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if coupon is active
      if (!coupon.is_active) {
        return new Response(
          JSON.stringify({ error: 'This coupon is no longer active' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check validity dates
      const now = new Date();
      const validFrom = new Date(coupon.valid_from);
      const validUntil = new Date(coupon.valid_until);

      if (now < validFrom || now > validUntil) {
        return new Response(
          JSON.stringify({ error: 'This coupon is not currently valid' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check landing page applicability
      if (coupon.landing_page_id && coupon.landing_page_id !== landing_page_id) {
        return new Response(
          JSON.stringify({ error: 'This coupon is not valid for this event' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check total usage limit
      if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
        return new Response(
          JSON.stringify({ error: 'This coupon has reached its usage limit' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check per-user usage
      const normalizedEmail = email.toLowerCase().trim();
      const { count: userUsageCount } = await supabase
        .from('event_coupon_usages')
        .select('*', { count: 'exact', head: true })
        .eq('coupon_id', coupon.id)
        .eq('email', normalizedEmail);

      if (userUsageCount !== null && userUsageCount >= coupon.max_uses_per_user) {
        return new Response(
          JSON.stringify({ error: 'You have already used this coupon the maximum number of times' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Coupon is valid! Calculate discount
      couponId = coupon.id;
      const discountValue = parseFloat(coupon.discount_value);
      
      if (coupon.discount_type === 'percentage') {
        discountAmount = Math.round((originalAmount * discountValue) / 100);
      } else {
        // Fixed discount
        discountAmount = discountValue;
      }
      
      // Ensure discount doesn't exceed original amount
      discountAmount = Math.min(discountAmount, originalAmount);
      finalAmount = originalAmount - discountAmount;
    }

    // Deterministic user lookup via profiles table
    const normalizedRegEmail = email.trim().toLowerCase();
    console.log('Looking up existing user for registration:', normalizedRegEmail);

    const { data: regProfileMatches } = await supabase
      .from('profiles')
      .select('id, email')
      .ilike('email', normalizedRegEmail);

    let existingUser = null;
    if (regProfileMatches && regProfileMatches.length === 1) {
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(regProfileMatches[0].id);
      if (authUser && authUser.email?.toLowerCase() === normalizedRegEmail) {
        existingUser = authUser;
        console.log('Resolved existing user via profiles:', authUser.id);
      }
    } else if (regProfileMatches && regProfileMatches.length > 1) {
      console.error('Ambiguous profile match for registration email:', normalizedRegEmail);
    }

    // Fallback: paginated auth scan
    if (!existingUser && (!regProfileMatches || regProfileMatches.length === 0)) {
      let page = 1;
      const perPage = 50;
      let found = false;
      while (!found) {
        const { data: { users } } = await supabase.auth.admin.listUsers({ page, perPage });
        if (!users || users.length === 0) break;
        const match = users.find(u => u.email?.toLowerCase() === normalizedRegEmail);
        if (match) { existingUser = match; found = true; console.log('Resolved existing user via scan:', match.id); }
        if (users.length < perPage) break;
        page++;
      }
    }

    let userId: string | null = null;
    let password: string | null = null;
    let isNewUser = false;

    if (existingUser) {
      // User already exists, just link them
      userId = existingUser.id;
    } else {
      // Validate phone number - required for new user registration
      if (!phone || phone.trim().length < 6) {
        return new Response(
          JSON.stringify({ error: 'Phone number is required for registration' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Use mobile number as password
      password = phone.trim();
      
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email.toLowerCase(),
        password: password,
        email_confirm: true, // Auto-confirm the email
        user_metadata: {
          first_name,
          last_name,
          phone,
          registered_via_event: landing_page_id
        }
      });

      if (createError) {
        console.error('Error creating user:', createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create user account' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userId = newUser.user.id;
      isNewUser = true;

      // Create profile for the new user
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email: email.toLowerCase(),
          first_name,
          last_name,
          phone
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        // Continue anyway, profile can be created later
      }
    }

    // Use URL UTM params if provided, otherwise fall back to landing page defaults
    const finalUtmSource = utm_source || landingPage.default_utm_source || null;
    const finalUtmMedium = utm_medium || landingPage.default_utm_medium || null;
    const finalUtmCampaign = utm_campaign || landingPage.default_utm_campaign || null;

    // Create the registration record
    const { data: registration, error: regError } = await supabase
      .from('event_registrations')
      .insert({
        landing_page_id,
        email: email.toLowerCase(),
        first_name,
        last_name,
        phone,
        user_id: userId,
        registration_data: registration_data || {},
        status: 'completed',
        coupon_id: couponId,
        original_amount: originalAmount,
        discount_amount: discountAmount,
        final_amount: finalAmount,
        utm_source: finalUtmSource,
        utm_medium: finalUtmMedium,
        utm_campaign: finalUtmCampaign
      })
      .select()
      .single();

    if (regError) {
      console.error('Error creating registration:', regError);
      return new Response(
        JSON.stringify({ error: 'Failed to create registration record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add user to the event's association as a member
    if (userId && landingPage.association_id) {
      try {
        // Find the default company for this association
        const { data: defaultCompany } = await supabase
          .from('companies')
          .select('id')
          .eq('association_id', landingPage.association_id)
          .eq('is_active', true)
          .eq('is_default', true)
          .limit(1)
          .maybeSingle();

        let companyId = defaultCompany?.id || null;

        if (!companyId) {
          // Fallback: pick the first active company in the association
          const { data: firstCompany } = await supabase
            .from('companies')
            .select('id')
            .eq('association_id', landingPage.association_id)
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          companyId = firstCompany?.id || null;
        }

        // If no company exists at all, create a default one for this association
        if (!companyId) {
          const associationName = (landingPage.associations as any)?.name || 'Association';
          const { data: newCompany, error: createCompanyError } = await supabase
            .from('companies')
            .insert({
              association_id: landingPage.association_id,
              name: `${associationName} - General`,
              email: `general@${associationName.toLowerCase().replace(/[^a-z0-9]/g, '')}.org`,
              is_default: true,
              is_active: true,
              description: 'Default company for association members',
            })
            .select('id')
            .single();

          if (createCompanyError) {
            console.error('Error creating default company:', createCompanyError);
          } else {
            companyId = newCompany.id;
            console.log('Created default company for association:', companyId);
          }
        }

        if (companyId) {
          // Check if user already has an active member record in this company
          const { data: existingMember } = await supabase
            .from('members')
            .select('id, company_id')
            .eq('user_id', userId)
            .eq('company_id', companyId)
            .eq('is_active', true)
            .maybeSingle();

          if (!existingMember) {
            // Also check if user has a member record with null company_id and update it
            const { data: nullCompanyMember } = await supabase
              .from('members')
              .select('id')
              .eq('user_id', userId)
              .is('company_id', null)
              .eq('is_active', true)
              .maybeSingle();

            if (nullCompanyMember) {
              // Fix existing record by setting company_id
              const { error: updateError } = await supabase
                .from('members')
                .update({ company_id: companyId })
                .eq('id', nullCompanyMember.id);

              if (updateError) {
                console.error('Error updating member company_id:', updateError);
              } else {
                console.log('Fixed member record with company_id:', companyId);
              }
            } else {
              // Create new member record
              const { error: memberError } = await supabase
                .from('members')
                .insert({
                  user_id: userId,
                  company_id: companyId,
                  role: 'member',
                  designation: 'Event Registrant',
                  is_active: true,
                });

              if (memberError) {
                console.error('Error adding user to association company:', memberError);
              } else {
                console.log('User added to association company:', companyId);
              }
            }
          } else {
            console.log('User already a member of company:', companyId);
          }
        }
      } catch (memberLinkError) {
        console.error('Error linking user to association:', memberLinkError);
      }
    }

    // Record coupon usage if a coupon was applied
    if (couponId) {
      const { error: usageError } = await supabase
        .from('event_coupon_usages')
        .insert({
          coupon_id: couponId,
          registration_id: registration.id,
          email: email.toLowerCase(),
          discount_applied: discountAmount
        });

      if (usageError) {
        console.error('Error recording coupon usage:', usageError);
        // Don't fail the registration, just log the error
      }
    }

    // Send welcome email with credentials (only for new users)
    if (isNewUser && password) {
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      
      if (resendApiKey) {
        // Format event details
        const eventTitle = landingPage.title;
        const eventDate = formatEventDate(landingPage.event_date);
        const eventTime = landingPage.event_time || 'Details to be announced';
        const eventVenue = landingPage.event_venue || 'Details to be announced';
        const portalUrl = 'https://smb-connect-hub.lovable.app/auth/login';

        try {
          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 650px; margin: 0 auto; padding: 0; background-color: #f5f5f5;">
              <!-- Header Banner -->
              <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 50%, #3d7ab5 100%); padding: 40px 30px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; letter-spacing: 0.5px;">
                  Welcome to ${eventTitle}!
                </h1>
                <p style="color: #e0e0e0; margin: 10px 0 0 0; font-size: 14px;">
                  Your registration is confirmed
                </p>
              </div>
              
              <!-- Main Content -->
              <div style="background: #ffffff; padding: 35px 30px;">
                <p style="font-size: 16px; margin: 0 0 20px 0;">
                  Dear <strong>${first_name}</strong>,
                </p>
                
                <p style="font-size: 15px; margin: 0 0 15px 0; color: #444;">
                  Thank you for registering for <strong>${eventTitle}</strong>! We're excited to have you join the vibrant ecosystem of D2C founders, brand leaders, investors, and industry enablers.
                </p>
                
                <p style="font-size: 15px; margin: 0 0 25px 0; color: #444;">
                  This registration also gives you exclusive access to the <strong>SMBConnect Portal</strong> — your gateway to meaningful business connections.
                </p>
                
                <!-- Event Details Section -->
                <div style="margin: 30px 0;">
                  <h2 style="font-size: 16px; color: #1e3a5f; margin: 0 0 15px 0; padding-bottom: 8px; border-bottom: 2px solid #1e3a5f; display: inline-block;">
                    📌 EVENT DETAILS
                  </h2>
                  <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 8px; overflow: hidden;">
                    <tr>
                      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b; width: 120px;">Event</td>
                      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${eventTitle}</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">Date</td>
                      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${eventDate}</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">Time</td>
                      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${eventTime}</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 16px; font-weight: 600; color: #64748b;">Venue</td>
                      <td style="padding: 12px 16px; color: #1e293b;">${eventVenue}</td>
                    </tr>
                  </table>
                  <p style="font-size: 13px; color: #64748b; margin: 10px 0 0 0; font-style: italic;">
                    Keep this email handy — your registration details will help with event access.
                  </p>
                </div>
                
                <!-- Portal Access Section -->
                <div style="margin: 30px 0;">
                  <h2 style="font-size: 16px; color: #1e3a5f; margin: 0 0 15px 0; padding-bottom: 8px; border-bottom: 2px solid #1e3a5f; display: inline-block;">
                    🌐 YOUR SMBCONNECT PORTAL ACCESS
                  </h2>
                  <table style="width: 100%; border-collapse: collapse; background: #f0f9ff; border-radius: 8px; overflow: hidden; border: 1px solid #bae6fd;">
                    <tr>
                      <td style="padding: 12px 16px; border-bottom: 1px solid #bae6fd; font-weight: 600; color: #0369a1; width: 150px;">Portal URL</td>
                      <td style="padding: 12px 16px; border-bottom: 1px solid #bae6fd;">
                        <a href="${portalUrl}" style="color: #0284c7; text-decoration: none; font-weight: 500;">${portalUrl}</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 16px; border-bottom: 1px solid #bae6fd; font-weight: 600; color: #0369a1;">Username</td>
                      <td style="padding: 12px 16px; border-bottom: 1px solid #bae6fd; color: #1e293b; font-family: monospace;">${email}</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 16px; font-weight: 600; color: #0369a1;">Temporary Password</td>
                      <td style="padding: 12px 16px; color: #1e293b;">
                        <code style="background: #ffffff; padding: 4px 10px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 14px; border: 1px solid #e2e8f0;">${password}</code>
                      </td>
                    </tr>
                  </table>
                  <p style="font-size: 13px; color: #dc2626; margin: 10px 0 0 0; font-weight: 500;">
                    ⚠️ For security, please update your password after your first login.
                  </p>
                </div>
                
                <!-- Features Section -->
                <div style="margin: 30px 0; background: #fefce8; padding: 20px; border-radius: 8px; border-left: 4px solid #eab308;">
                  <h3 style="font-size: 15px; color: #854d0e; margin: 0 0 12px 0;">
                    WHAT YOU CAN DO ON SMBCONNECT:
                  </h3>
                  <ul style="margin: 0; padding: 0 0 0 5px; list-style: none;">
                    <li style="padding: 6px 0; color: #713f12; font-size: 14px;">
                      ✓ Connect with founders, investors, and business leaders
                    </li>
                    <li style="padding: 6px 0; color: #713f12; font-size: 14px;">
                      ✓ Stay updated on events, awards, and exhibitions
                    </li>
                    <li style="padding: 6px 0; color: #713f12; font-size: 14px;">
                      ✓ Access exclusive reports and industry insights
                    </li>
                  </ul>
                </div>
                
                <!-- CTA Button -->
                <div style="text-align: center; margin: 35px 0 25px 0;">
                  <a href="${portalUrl}" 
                     style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: #ffffff; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 4px 14px rgba(30, 58, 95, 0.25);">
                    Login to SMBConnect Portal
                  </a>
                </div>
                
                <!-- Closing -->
                <p style="font-size: 15px; margin: 25px 0 0 0; color: #444;">
                  We're excited to have you on board and look forward to seeing you at <strong>${eventTitle}</strong>.
                </p>
                
                <p style="font-size: 15px; margin: 25px 0 0 0; color: #333;">
                  Warm regards,<br>
                  <strong style="color: #1e3a5f;">SMBConnect</strong>
                </p>
              </div>
              
              <!-- Footer -->
              <div style="background: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="color: #64748b; font-size: 12px; margin: 0;">
                  © ${new Date().getFullYear()} SMBConnect. All rights reserved.
                </p>
              </div>
            </body>
            </html>
          `;

          // Plain text version
          const emailText = `Dear ${first_name},

Thank you for registering for ${eventTitle}! We're excited to have you join the vibrant ecosystem of D2C founders, brand leaders, investors, and industry enablers.

This registration also gives you exclusive access to the SMBConnect Portal — your gateway to meaningful business connections.

📌 EVENT DETAILS
- Event: ${eventTitle}
- Date: ${eventDate}
- Time: ${eventTime}
- Venue: ${eventVenue}

🌐 YOUR SMBCONNECT PORTAL ACCESS
- Portal URL: ${portalUrl}
- Username: ${email}
- Temporary Password: ${password}

For security, please update your password after your first login.

WHAT YOU CAN DO ON SMBCONNECT:
✓ Connect with founders, investors, and business leaders
✓ Stay updated on events, awards, and exhibitions
✓ Access exclusive reports and industry insights

We're excited to have you on board and look forward to seeing you at ${eventTitle}.

Warm regards,
SMBConnect`;

          // Use Resend API
          const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'SMB Connect <noreply@smbconnect.in>',
              to: [email],
              subject: `Welcome to ${eventTitle} & Your SMBConnect Portal Access`,
              html: emailHtml,
              text: emailText,
            }),
          });

          if (!resendResponse.ok) {
            const errorText = await resendResponse.text();
            console.error('Resend API error:', errorText);
          } else {
            console.log('Welcome email sent successfully to:', email);
          }
        } catch (emailError) {
          console.error('Error sending welcome email:', emailError);
          // Continue anyway, registration is still successful
        }
      } else {
        console.warn('RESEND_API_KEY not configured, skipping welcome email');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: isNewUser 
          ? 'Registration successful! Check your email for login credentials.'
          : 'Registration successful! You can login with your existing account.',
        registration_id: registration.id,
        is_new_user: isNewUser
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-event-registration:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});