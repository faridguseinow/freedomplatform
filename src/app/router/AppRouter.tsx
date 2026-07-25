import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { FullPageLoader } from '../../components/common/StateView'
import { AdminLayout } from '../layouts/AdminLayout'
import { EmployeeLayout } from '../layouts/EmployeeLayout'
import { PlatformLayout } from '../layouts/PlatformLayout'
import { ProtectedRoute } from './ProtectedRoute'
import { RoleRoute } from './RoleRoute'
import { RootRedirect } from './RootRedirect'
import { AccessNotConfiguredPage } from '../../features/auth/pages/AccessNotConfiguredPage'
import { LoginPage } from '../../features/auth/pages/LoginPage'
import { EmployeeShiftPage } from '../../features/employee/pages/EmployeeShiftPage'
import { EmployeeWorkspacePage } from '../../features/employee/pages/EmployeeWorkspacePage'
import { AdminDashboardPage } from '../../features/organization/pages/AdminDashboardPage'
import { AdminEmployeesPage } from '../../features/organization/pages/AdminEmployeesPage'
import { AdminSettingsPage } from '../../features/organization/pages/AdminSettingsPage'
import { PlatformOrganizationUsersPage } from '../../features/platform/pages/PlatformOrganizationUsersPage'
import { PlatformOrganizationsPage } from '../../features/platform/pages/PlatformOrganizationsPage'
import { PlatformOverviewPage } from '../../features/platform/pages/PlatformOverviewPage'
import { PlatformSettingsPage } from '../../features/platform/pages/PlatformSettingsPage'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { USER_ROLES } from '../../types/roles'

const AdminCatalogPage = lazy(() =>
  import('../../features/organization/pages/AdminCatalogPage').then((module) => ({
    default: module.AdminCatalogPage,
  })),
)
const AdminCategoriesPage = lazy(() =>
  import('../../features/organization/pages/AdminCategoriesPage').then((module) => ({
    default: module.AdminCategoriesPage,
  })),
)
const AdminPlacesPage = lazy(() =>
  import('../../features/organization/pages/AdminPlacesPage').then((module) => ({
    default: module.AdminPlacesPage,
  })),
)
const AdminProductsPage = lazy(() =>
  import('../../features/organization/pages/AdminProductsPage').then((module) => ({
    default: module.AdminProductsPage,
  })),
)
const AdminServicesPage = lazy(() =>
  import('../../features/organization/pages/AdminServicesPage').then((module) => ({
    default: module.AdminServicesPage,
  })),
)
const AdminInventoryPage = lazy(() =>
  import('../../features/organization/pages/AdminInventoryPage').then((module) => ({
    default: module.AdminInventoryPage,
  })),
)
const AdminInventoryDocumentsPage = lazy(() =>
  import('../../features/organization/pages/AdminInventoryDocumentsPage').then((module) => ({
    default: module.AdminInventoryDocumentsPage,
  })),
)
const AdminInventoryProductPage = lazy(() =>
  import('../../features/organization/pages/AdminInventoryProductPage').then((module) => ({
    default: module.AdminInventoryProductPage,
  })),
)
const AdminCombosPage = lazy(() =>
  import('../../features/organization/pages/AdminCombosPage').then((module) => ({
    default: module.AdminCombosPage,
  })),
)
const AdminOrdersPage = lazy(() =>
  import('../../features/organization/pages/AdminOrdersPage').then((module) => ({
    default: module.AdminOrdersPage,
  })),
)
const AdminOrderDetailPage = lazy(() =>
  import('../../features/organization/pages/AdminOrderDetailPage').then((module) => ({
    default: module.AdminOrderDetailPage,
  })),
)
const AdminAdjustmentRequestsPage = lazy(() =>
  import('../../features/organization/pages/AdminAdjustmentRequestsPage').then((module) => ({
    default: module.AdminAdjustmentRequestsPage,
  })),
)
const AdminShiftsPage = lazy(() =>
  import('../../features/organization/pages/AdminShiftsPage').then((module) => ({
    default: module.AdminShiftsPage,
  })),
)
const AdminShiftDetailPage = lazy(() =>
  import('../../features/organization/pages/AdminShiftDetailPage').then((module) => ({
    default: module.AdminShiftDetailPage,
  })),
)
const AdminShiftTemplatesPage = lazy(() =>
  import('../../features/organization/pages/AdminShiftTemplatesPage').then((module) => ({
    default: module.AdminShiftTemplatesPage,
  })),
)
const AdminOperationalDaysPage = lazy(() =>
  import('../../features/organization/pages/AdminOperationalDaysPage').then((module) => ({
    default: module.AdminOperationalDaysPage,
  })),
)
const AdminNotificationSettingsPage = lazy(() =>
  import('../../features/organization/pages/AdminNotificationSettingsPage').then((module) => ({
    default: module.AdminNotificationSettingsPage,
  })),
)

const lazyPage = (element: ReactNode) => (
  <Suspense fallback={<FullPageLoader />}>{element}</Suspense>
)

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootRedirect />} path="/" />
        <Route element={<LoginPage />} path="/login" />
        <Route element={<AccessNotConfiguredPage />} path="/access-not-configured" />

        <Route element={<ProtectedRoute />}>
          <Route element={<RoleRoute allowedRoles={[USER_ROLES.platformOwner]} />}>
            <Route element={<PlatformLayout />} path="/platform">
              <Route element={<PlatformOverviewPage />} index />
              <Route element={<PlatformOrganizationsPage />} path="organizations" />
              <Route
                element={<PlatformOrganizationUsersPage />}
                path="organizations/:organizationId/users"
              />
              <Route element={<PlatformSettingsPage />} path="settings" />
            </Route>
          </Route>

          <Route element={<RoleRoute allowedRoles={[USER_ROLES.organizationAdmin]} />}>
            <Route element={<AdminLayout />} path="/admin">
              <Route element={<AdminDashboardPage />} index />
              <Route element={<AdminDashboardPage />} path="dashboard" />
              <Route element={<AdminEmployeesPage />} path="employees" />
              <Route element={lazyPage(<AdminCatalogPage />)} path="catalog" />
              <Route element={lazyPage(<AdminCategoriesPage />)} path="categories" />
              <Route element={lazyPage(<AdminPlacesPage />)} path="places" />
              <Route element={lazyPage(<AdminProductsPage />)} path="products" />
              <Route element={lazyPage(<AdminServicesPage />)} path="services" />
              <Route element={lazyPage(<AdminInventoryPage />)} path="inventory" />
              <Route element={lazyPage(<AdminInventoryDocumentsPage />)} path="inventory/documents" />
              <Route element={lazyPage(<AdminInventoryProductPage />)} path="inventory/products/:productId" />
              <Route element={lazyPage(<AdminCombosPage />)} path="combos" />
              <Route element={lazyPage(<AdminOrdersPage />)} path="orders" />
              <Route element={lazyPage(<AdminOrderDetailPage />)} path="orders/:orderId" />
              <Route element={lazyPage(<AdminAdjustmentRequestsPage />)} path="adjustment-requests" />
              <Route element={lazyPage(<AdminShiftsPage />)} path="shifts" />
              <Route element={lazyPage(<AdminShiftDetailPage />)} path="shifts/:shiftId" />
              <Route element={lazyPage(<AdminShiftTemplatesPage />)} path="shift-templates" />
              <Route element={lazyPage(<AdminOperationalDaysPage />)} path="operational-days" />
              <Route element={lazyPage(<AdminNotificationSettingsPage />)} path="notification-settings" />
              <Route element={<AdminSettingsPage />} path="settings" />
            </Route>
          </Route>

          <Route element={<RoleRoute allowedRoles={[USER_ROLES.employee]} />}>
            <Route element={<EmployeeLayout />} path="/employee">
              <Route element={<EmployeeWorkspacePage />} index />
              <Route element={<EmployeeWorkspacePage />} path="workspace" />
              <Route element={<EmployeeShiftPage />} path="shift" />
            </Route>
          </Route>
        </Route>

        <Route element={<NotFoundPage />} path="*" />
      </Routes>
    </BrowserRouter>
  )
}
