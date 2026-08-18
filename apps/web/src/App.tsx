import { lazy, Suspense, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import AnnouncementModal from "./components/AnnouncementModal";
import Footer from "./components/Footer";
import TopBar from "./components/TopBar";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { get } from "./lib/api";
import Banned from "./pages/Banned";
import Maintenance from "./pages/Maintenance";
import NotFound from "./pages/NotFound";

const Home = lazy(() => import("./pages/Home"));
const Setup = lazy(() => import("./pages/Setup"));
const Profile = lazy(() => import("./pages/Profile"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const LiveList = lazy(() => import("./pages/LiveList"));
const Room = lazy(() => import("./pages/Room"));
const Recordings = lazy(() => import("./pages/Recordings"));
const DanmakuPopout = lazy(() => import("./pages/DanmakuPopout"));
const Recharge = lazy(() => import("./pages/Recharge"));
const Withdrawal = lazy(() => import("./pages/Withdrawal"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminRooms = lazy(() => import("./pages/admin/AdminRooms"));
const AdminWithdrawals = lazy(() => import("./pages/admin/AdminWithdrawals"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminRBAC = lazy(() => import("./pages/admin/AdminRBAC"));
const AdminAudit = lazy(() => import("./pages/admin/AdminAudit"));
const AdminModeration = lazy(
  () => import("./pages/admin/AdminAudit").then((m) => ({ default: m.AdminModeration })),
);
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));

function Loading() {
  return <div className="empty container">加载中…</div>;
}

interface Features {
  maintenanceEnabled: boolean;
  maintenanceMessage?: string;
}

function Shell() {
  const { user, loading, isAdmin } = useAuth();
  const [features, setFeatures] = useState<Features | null>(null);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    get<Features>("/system/features").then(setFeatures).catch(() => undefined);
    get<{ needsSetup: boolean }>("/auth/setup-status")
      .then((r) => setNeedsSetup(r.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  if (loading || needsSetup === null) {
    return <Loading />;
  }

  // 首次部署：先创建超级管理员
  if (needsSetup) {
    return (
      <Suspense fallback={<Loading />}>
        <Setup onDone={() => setNeedsSetup(false)} />
      </Suspense>
    );
  }

  if (user?.banned) {
    return <Banned />;
  }

  if (features?.maintenanceEnabled && !isAdmin) {
    return <Maintenance message={features.maintenanceMessage} />;
  }

  return (
    <>
      <TopBar />
      <AnnouncementModal />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/live-list" element={<LiveList />} />
          <Route path="/room/:roomId" element={<Room />} />
          <Route path="/room/:roomId/recordings" element={<Recordings />} />
          <Route path="/room/:roomId/danmaku-popout" element={<DanmakuPopout />} />
          <Route path="/recharge" element={<Recharge />} />
          <Route path="/withdrawal" element={<Withdrawal />} />
          <Route path="/banned" element={<Banned />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="rooms" element={<AdminRooms />} />
            <Route path="withdrawals" element={<AdminWithdrawals />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="rbac" element={<AdminRBAC />} />
            <Route path="moderation" element={<AdminModeration />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
