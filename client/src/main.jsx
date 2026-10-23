import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import './styles.css';
import { AppProvider, useApp } from './lib/store';
import { PublicLayout, PortalLayout, StaffLayout } from './components/Layouts';
import { PageSkeleton } from './components/ui';
import Home from './pages/Home';
import Book from './pages/Book';
import { Login, Signup } from './pages/Auth';
import { LearnList, Article } from './pages/Learn';
import { PortalHome, PortalVisits, PortalVisit, PortalAppointments, PortalProfile } from './pages/Portal';
import { StaffToday, StaffAppointments } from './pages/StaffToday';
import { StaffPatients, StaffPatient } from './pages/StaffPatients';
import VisitEditor from './pages/VisitEditor';
import Pharmacy from './pages/Pharmacy';
import PrintVisit from './pages/PrintVisit';
import { Schedule, StaffAccounts, ArticlesAdmin, ClinicSettings, More } from './pages/Admin';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/** Only lets the given roles in; everyone else goes to login or their own home. */
function Guard({ roles, children }) {
  const { user, booting } = useApp();
  const location = useLocation();
  if (booting) return <div className="page"><PageSkeleton /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === 'patient' ? '/portal' : '/staff'} replace />;
  return children;
}

/** Logged-in visitors skip the login/signup pages. */
function GuestOnly({ children }) {
  const { user } = useApp();
  if (user) return <Navigate to={user.role === 'patient' ? '/portal' : '/staff'} replace />;
  return children;
}

const STAFF = ['doctor', 'reception', 'admin'];

function App() {
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="book" element={<Book />} />
          <Route path="learn" element={<LearnList />} />
          <Route path="learn/:slug" element={<Article />} />
        </Route>
        <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="signup" element={<GuestOnly><Signup /></GuestOnly>} />
        <Route path="print/visit/:id" element={<Guard><PrintVisit /></Guard>} />

        <Route path="portal" element={<Guard roles={['patient']}><PortalLayout /></Guard>}>
          <Route index element={<PortalHome />} />
          <Route path="book" element={<Book inPortal />} />
          <Route path="visits" element={<PortalVisits />} />
          <Route path="visits/:id" element={<PortalVisit />} />
          <Route path="appointments" element={<PortalAppointments />} />
          <Route path="learn" element={<LearnList inPortal />} />
          <Route path="learn/:slug" element={<Article inPortal />} />
          <Route path="profile" element={<PortalProfile />} />
        </Route>

        <Route path="staff" element={<Guard roles={STAFF}><StaffLayout /></Guard>}>
          <Route index element={<StaffToday />} />
          <Route path="appointments" element={<StaffAppointments />} />
          <Route path="patients" element={<StaffPatients />} />
          <Route path="patients/:id" element={<StaffPatient />} />
          <Route path="visits/new" element={<VisitEditor />} />
          <Route path="visits/:id" element={<VisitEditor />} />
          <Route path="pharmacy" element={<Pharmacy />} />
          <Route path="schedule" element={<Guard roles={['admin']}><Schedule /></Guard>} />
          <Route path="staff" element={<Guard roles={['admin']}><StaffAccounts /></Guard>} />
          <Route path="articles" element={<Guard roles={['admin']}><ArticlesAdmin /></Guard>} />
          <Route path="settings" element={<Guard roles={['admin']}><ClinicSettings /></Guard>} />
          <Route path="more" element={<Guard roles={['admin']}><More /></Guard>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>
);
