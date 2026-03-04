import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { HomeButton } from "./components/HomeButton";
import { RoleProvider } from "./contexts/RoleContext";
import Index from "./pages/Index";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ResetPassword from "./pages/auth/ResetPassword";
import AcceptInvitation from "./pages/AcceptInvitation";
import AcceptMemberInvitation from "./pages/auth/AcceptMemberInvitation";
import Dashboard from "./pages/Dashboard";
import SelectRole from "./pages/SelectRole";
import Setup from "./pages/Setup";
import RequestAssociation from "./pages/RequestAssociation";
import RequestCompany from "./pages/RequestCompany";
import EventsCalendar from "./pages/EventsCalendar";
import AdminActions from "./pages/admin/AdminActions";
import UserManagement from "./pages/admin/UserManagement";
import AdminAssociations from "./pages/admin/AdminAssociations";
import AdminCompanies from "./pages/admin/AdminCompanies";
import AdminAssociationRequests from "./pages/admin/AdminAssociationRequests";
import AdminCompanyRequests from "./pages/admin/AdminCompanyRequests";
import AssociationProfileView from "./pages/admin/AssociationProfileView";
import AdminCompanyProfileView from "./pages/admin/AdminCompanyProfileView";
import CreateAssociation from "./pages/admin/CreateAssociation";
import BrowseCompanies from "./pages/member/BrowseCompanies";
import BrowseAssociations from "./pages/member/BrowseAssociations";
import CompanyProfileView from "./pages/member/CompanyProfileView";
import MemberAssociationProfileView from "./pages/member/AssociationProfileView";
import CreateCompany from "./pages/admin/CreateCompany";
import CreateUser from "./pages/admin/CreateUser";
import BulkUploadAssociations from "./pages/admin/BulkUploadAssociations";
import BulkUploadCompanies from "./pages/admin/BulkUploadCompanies";
import AdminEmailLists from "./pages/admin/AdminEmailLists";
import AdminEmailListDetail from "./pages/admin/AdminEmailListDetail";
import AdminEmailAnalytics from "./pages/admin/AdminEmailAnalytics";
import AdminWhatsAppLists from "./pages/admin/AdminWhatsAppLists";
import AdminWhatsAppListDetail from "./pages/admin/AdminWhatsAppListDetail";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import MemberInvitations from "./pages/admin/MemberInvitations";
import AssociationDashboard from "./pages/association/AssociationDashboard";
import AssociationCompanies from "./pages/association/AssociationCompanies";
import AssociationInvitations from "./pages/association/AssociationInvitations";
import AssociationMembers from "./pages/association/AssociationMembers";
import AssociationProfile from "./pages/association/AssociationProfile";
import AssociationBulkUploadCompanies from "./pages/association/BulkUploadCompanies";
import AssociationEmailLists from "./pages/association/AssociationEmailLists";
import AssociationEmailListDetail from "./pages/association/AssociationEmailListDetail";
import AssociationEmailAnalytics from "./pages/association/AssociationEmailAnalytics";
import AssociationAnalytics from "./pages/association/AssociationAnalytics";
import CompanyDashboard from "./pages/company/CompanyDashboard";
import CompanyMembers from "./pages/company/CompanyMembers";
import CompanyEmailLists from "./pages/company/CompanyEmailLists";
import CompanyEmailListDetail from "./pages/company/CompanyEmailListDetail";
import CompanyEmailAnalytics from "./pages/company/CompanyEmailAnalytics";
import MemberDashboard from "./pages/member/MemberDashboard";
import MemberCompanies from "./pages/member/MemberCompanies";
import MemberConnections from "./pages/member/MemberConnections";
import BrowseMembers from "./pages/member/BrowseMembers";
import MemberProfile from "./pages/member/MemberProfile";
import MemberFeed from "./pages/member/MemberFeed";
import MemberMessages from "./pages/member/MemberMessages";
import SavedPosts from "./pages/member/SavedPosts";
import MemberNotifications from "./pages/member/MemberNotifications";
import CompanyFeed from "./pages/company/CompanyFeed";
import AssociationFeed from "./pages/association/AssociationFeed";
import NotFound from "./pages/NotFound";
import AccountSettings from "./pages/AccountSettings";
import EventLandingPages from "./pages/admin/EventLandingPages";
import CreateLandingPage from "./pages/admin/CreateLandingPage";
import EventLandingPageView from "./pages/public/EventLandingPageView";
import CouponManagement from "./pages/admin/CouponManagement";
import EventRegistrations from "./pages/admin/EventRegistrations";
import DataExport from "./pages/admin/DataExport";

const queryClient = new QueryClient();

const AppContent = () => {
  const location = useLocation();
  const hideHomeButton = ['/', '/auth/login', '/auth/register'].includes(location.pathname) || location.pathname.startsWith('/event/');

  return (
    <>
      {!hideHomeButton && <HomeButton />}
      <Routes>
        <Route path="/" element={<Login />} />
            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/accept-invitation" element={<AcceptInvitation />} />
            <Route path="/register" element={<AcceptMemberInvitation />} />
            <Route 
              path="/select-role" 
              element={
                <ProtectedRoute>
                  <SelectRole />
                </ProtectedRoute>
              } 
            />
            <Route path="/account-settings" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
        <Route 
          path="/setup" 
          element={
            <ProtectedRoute>
              <Setup />
            </ProtectedRoute>
          }
          />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/calendar" 
            element={
              <ProtectedRoute>
                <EventsCalendar />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dashboard/messages"
            element={
              <ProtectedRoute>
                <MemberMessages />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminAnalytics />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/actions"
            element={
              <ProtectedRoute>
                <AdminActions />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/admin/users" 
            element={
              <ProtectedRoute>
                <UserManagement />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/admin/create-user" 
            element={
              <ProtectedRoute>
                <CreateUser />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/associations" 
            element={
              <ProtectedRoute>
                <AdminAssociations />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/associations/:id" 
            element={
              <ProtectedRoute>
                <AssociationProfileView />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/companies"
            element={
              <ProtectedRoute>
                <AdminCompanies />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/companies/:id"
            element={
              <ProtectedRoute>
                <AdminCompanyProfileView />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/requests"
            element={
              <ProtectedRoute>
                <AdminAssociationRequests />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/company-requests" 
            element={
              <ProtectedRoute>
                <AdminCompanyRequests />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/admin/create-association"
            element={
              <ProtectedRoute>
                <CreateAssociation />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/create-company" 
            element={
              <ProtectedRoute>
                <CreateCompany />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/bulk-upload-associations"
            element={
              <ProtectedRoute>
                <BulkUploadAssociations />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/bulk-upload-companies" 
            element={
              <ProtectedRoute>
                <BulkUploadCompanies />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/email-lists"
            element={
              <ProtectedRoute>
                <AdminEmailLists />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/email-lists/:listId" 
            element={
              <ProtectedRoute>
                <AdminEmailListDetail />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/email-analytics" 
            element={
              <ProtectedRoute>
                <AdminEmailAnalytics />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/whatsapp-lists"
            element={
              <ProtectedRoute>
                <AdminWhatsAppLists />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/whatsapp-lists/:listId" 
            element={
              <ProtectedRoute>
                <AdminWhatsAppListDetail />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/analytics" 
            element={
              <ProtectedRoute>
                <AdminAnalytics />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/invitations" 
            element={
              <ProtectedRoute>
                <MemberInvitations />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/event-landing-pages" 
            element={
              <ProtectedRoute>
                <EventLandingPages />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/event-landing-pages/new" 
            element={
              <ProtectedRoute>
                <CreateLandingPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/event-landing-pages/:id/edit" 
            element={
              <ProtectedRoute>
                <CreateLandingPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/event-landing-pages/:id/registrations" 
            element={
              <ProtectedRoute>
                <EventRegistrations />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/coupons" 
            element={
              <ProtectedRoute>
                <CouponManagement />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/request-association"
            element={
              <ProtectedRoute>
                <RequestAssociation />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/request-company"
            element={
              <ProtectedRoute>
                <RequestCompany />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/association" 
            element={
              <ProtectedRoute>
                <AssociationDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/association/companies" 
            element={
              <ProtectedRoute>
                <AssociationCompanies />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/association/invitations" 
            element={
              <ProtectedRoute>
                <AssociationInvitations />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/association/members" 
            element={
              <ProtectedRoute>
                <AssociationMembers />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/association/profile" 
            element={
              <ProtectedRoute>
                <AssociationProfile />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/association/bulk-upload-companies" 
            element={
              <ProtectedRoute>
                <AssociationBulkUploadCompanies />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/association/manage-invitations" 
            element={
              <ProtectedRoute>
                <MemberInvitations />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/association/email-lists" 
            element={
              <ProtectedRoute>
                <AssociationEmailLists />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/association/email-lists/:listId" 
            element={
              <ProtectedRoute>
                <AssociationEmailListDetail />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/association/email-analytics" 
            element={
              <ProtectedRoute>
                <AssociationEmailAnalytics />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/association/analytics" 
            element={
              <ProtectedRoute>
                <AssociationAnalytics />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/association/feed"
            element={
              <ProtectedRoute>
                <AssociationFeed />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/company"
            element={
              <ProtectedRoute>
                <CompanyDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/company/members"
            element={
              <ProtectedRoute>
                <CompanyMembers />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/company/manage-invitations" 
            element={
              <ProtectedRoute>
                <MemberInvitations />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/company/email-lists" 
            element={
              <ProtectedRoute>
                <CompanyEmailLists />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/company/email-lists/:listId" 
            element={
              <ProtectedRoute>
                <CompanyEmailListDetail />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/company/email-analytics" 
            element={
              <ProtectedRoute>
                <CompanyEmailAnalytics />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/company/feed" 
            element={
              <ProtectedRoute>
                <CompanyFeed />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/member"
            element={
              <ProtectedRoute>
                <MemberDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/companies" 
            element={
              <ProtectedRoute>
                <MemberCompanies />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/connections" 
            element={
              <ProtectedRoute>
                <MemberConnections />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/member/connections" 
            element={
              <ProtectedRoute>
                <MemberConnections />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/members" 
            element={
              <ProtectedRoute>
                <BrowseMembers />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/member/browse-companies" 
            element={
              <ProtectedRoute>
                <BrowseCompanies />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/member/browse-associations" 
            element={
              <ProtectedRoute>
                <BrowseAssociations />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/member/company/:id" 
            element={
              <ProtectedRoute>
                <CompanyProfileView />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/member/associations/:id" 
            element={
              <ProtectedRoute>
                <MemberAssociationProfileView />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/profile/:userId" 
            element={
              <ProtectedRoute>
                <MemberProfile />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/feed" 
            element={
              <ProtectedRoute>
                <MemberFeed />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/messages" 
            element={
              <ProtectedRoute>
                <MemberMessages />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/saved-posts" 
            element={
              <ProtectedRoute>
                <SavedPosts />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/notifications" 
            element={
              <ProtectedRoute>
                <MemberNotifications />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/company/feed" 
            element={
              <ProtectedRoute>
                <CompanyFeed />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/association/feed" 
            element={
              <ProtectedRoute>
                <AssociationFeed />
              </ProtectedRoute>
            } 
          />
          {/* Public event landing pages - NO AUTH REQUIRED */}
          <Route path="/event/:slug" element={<EventLandingPageView />} />
          <Route path="/event/:slug/:subPage" element={<EventLandingPageView />} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <RoleProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </RoleProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
