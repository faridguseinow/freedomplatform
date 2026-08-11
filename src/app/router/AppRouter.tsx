import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { FullPageLoader } from '../../components/common/StateView'
import { AdminLayout } from '../layouts/AdminLayout'
import { EmployeeLayout } from '../layouts/EmployeeLayout'
import { PlatformLayout } from '../layouts/PlatformLayout'
import { LegacyOrganizationRedirect } from './LegacyOrganizationRedirect'
import { OrganizationSlugHomeRedirect } from './OrganizationSlugHomeRedirect'
import { OrganizationSlugRoute } from './OrganizationSlugRoute'
import { ProtectedRoute } from './ProtectedRoute'
import { RoleRoute } from './RoleRoute'
import { RootRedirect } from './RootRedirect'
import { AccessNotConfiguredPage } from '../../features/auth/pages/AccessNotConfiguredPage'
import { LoginPage } from '../../features/auth/pages/LoginPage'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { USER_ROLES } from '../../types/roles'

const AdminDashboardPage = lazy(() =>
  import('../../features/organization/pages/AdminDashboardPage').then((module) => ({
    default: module.AdminDashboardPage,
  })),
)
const AdminEmployeesPage = lazy(() =>
  import('../../features/organization/pages/AdminEmployeesPage').then((module) => ({
    default: module.AdminEmployeesPage,
  })),
)
const AdminSettingsPage = lazy(() =>
  import('../../features/organization/pages/AdminSettingsPage').then((module) => ({
    default: module.AdminSettingsPage,
  })),
)
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
const AdminFinancePage = lazy(() =>
  import('../../features/finance/pages/AdminFinancePages').then((module) => ({
    default: module.AdminFinancePage,
  })),
)
const AdminFinanceIncomePage = lazy(() =>
  import('../../features/finance/pages/AdminFinancePages').then((module) => ({
    default: module.AdminFinanceIncomePage,
  })),
)
const AdminFinanceExpensesPage = lazy(() =>
  import('../../features/finance/pages/AdminFinancePages').then((module) => ({
    default: module.AdminFinanceExpensesPage,
  })),
)
const AdminFinanceRecurringPage = lazy(() =>
  import('../../features/finance/pages/AdminFinancePages').then((module) => ({
    default: module.AdminFinanceRecurringPage,
  })),
)
const AdminFinancePurchasesPage = lazy(() =>
  import('../../features/finance/pages/AdminFinancePages').then((module) => ({
    default: module.AdminFinancePurchasesPage,
  })),
)
const AdminFinanceCashFlowPage = lazy(() =>
  import('../../features/finance/pages/AdminFinancePages').then((module) => ({
    default: module.AdminFinanceCashFlowPage,
  })),
)
const AdminFinanceProfitLossPage = lazy(() =>
  import('../../features/finance/pages/AdminFinancePages').then((module) => ({
    default: module.AdminFinanceProfitLossPage,
  })),
)
const AdminFinancePeriodsPage = lazy(() =>
  import('../../features/finance/pages/AdminFinancePages').then((module) => ({
    default: module.AdminFinancePeriodsPage,
  })),
)
const AdminFinancePeriodDetailPage = lazy(() =>
  import('../../features/finance/pages/AdminFinancePages').then((module) => ({
    default: module.AdminFinancePeriodDetailPage,
  })),
)
const AdminFinancePlatformSharePage = lazy(() =>
  import('../../features/finance/pages/AdminFinancePages').then((module) => ({
    default: module.AdminFinancePlatformSharePage,
  })),
)
const AdminFinanceSettingsPage = lazy(() =>
  import('../../features/finance/pages/AdminFinancePages').then((module) => ({
    default: module.AdminFinanceSettingsPage,
  })),
)
const PlatformFinancePage = lazy(() =>
  import('../../features/finance/pages/PlatformFinancePages').then((module) => ({
    default: module.PlatformFinancePage,
  })),
)
const PlatformFinanceOrganizationPage = lazy(() =>
  import('../../features/finance/pages/PlatformFinancePages').then((module) => ({
    default: module.PlatformFinanceOrganizationPage,
  })),
)
const PlatformFinancePeriodPage = lazy(() =>
  import('../../features/finance/pages/PlatformFinancePages').then((module) => ({
    default: module.PlatformFinancePeriodPage,
  })),
)
const PlatformFinancePaymentsPage = lazy(() =>
  import('../../features/finance/pages/PlatformFinancePages').then((module) => ({
    default: module.PlatformFinancePaymentsPage,
  })),
)
const PlatformOverviewPage = lazy(() =>
  import('../../features/platform/pages/PlatformOverviewPage').then((module) => ({
    default: module.PlatformOverviewPage,
  })),
)
const PlatformOrganizationsPage = lazy(() =>
  import('../../features/platform/pages/PlatformOrganizationsPage').then((module) => ({
    default: module.PlatformOrganizationsPage,
  })),
)
const PlatformOrganizationUsersPage = lazy(() =>
  import('../../features/platform/pages/PlatformOrganizationUsersPage').then((module) => ({
    default: module.PlatformOrganizationUsersPage,
  })),
)
const PlatformOrganizationSetupPage = lazy(() =>
  import('../../features/platform/pages/PlatformOrganizationSetupPage').then((module) => ({
    default: module.PlatformOrganizationSetupPage,
  })),
)
const PlatformSettingsPage = lazy(() =>
  import('../../features/platform/pages/PlatformSettingsPage').then((module) => ({
    default: module.PlatformSettingsPage,
  })),
)
const EmployeeWorkspacePage = lazy(() =>
  import('../../features/employee/pages/EmployeeWorkspacePage').then((module) => ({
    default: module.EmployeeWorkspacePage,
  })),
)
const EmployeeShiftPage = lazy(() =>
  import('../../features/employee/pages/EmployeeShiftPage').then((module) => ({
    default: module.EmployeeShiftPage,
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
              <Route element={lazyPage(<PlatformOverviewPage />)} index />
              <Route element={lazyPage(<PlatformOrganizationsPage />)} path="organizations" />
              <Route
                element={lazyPage(<PlatformOrganizationUsersPage />)}
                path="organizations/:organizationId/users"
              />
              <Route
                element={lazyPage(<PlatformOrganizationSetupPage />)}
                path="organizations/:organizationId/setup"
              />
              <Route element={lazyPage(<PlatformFinancePage />)} path="finance" />
              <Route
                element={lazyPage(<PlatformFinanceOrganizationPage />)}
                path="finance/organizations/:organizationId"
              />
              <Route
                element={lazyPage(<PlatformFinancePeriodPage />)}
                path="finance/periods/:periodId"
              />
              <Route element={lazyPage(<PlatformFinancePaymentsPage />)} path="finance/payments" />
              <Route element={lazyPage(<PlatformSettingsPage />)} path="settings" />
            </Route>
          </Route>

          <Route element={<OrganizationSlugRoute />}>
            <Route element={<OrganizationSlugHomeRedirect />} path="/:organizationSlug" />
          </Route>

          <Route element={<RoleRoute allowedRoles={[USER_ROLES.organizationAdmin]} />}>
            <Route element={<LegacyOrganizationRedirect area="admin" />} path="/admin/*" />
          </Route>

          <Route element={<OrganizationSlugRoute />}>
            <Route element={<RoleRoute allowedRoles={[USER_ROLES.platformOwner, USER_ROLES.organizationAdmin]} />}>
              <Route element={<AdminLayout />} path="/:organizationSlug/admin">
              <Route element={lazyPage(<AdminDashboardPage />)} index />
              <Route element={lazyPage(<AdminDashboardPage />)} path="dashboard" />
              <Route element={lazyPage(<AdminEmployeesPage />)} path="employees" />
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
              <Route element={lazyPage(<AdminFinancePage />)} path="finance" />
              <Route element={lazyPage(<AdminFinanceIncomePage />)} path="finance/income" />
              <Route element={lazyPage(<AdminFinanceExpensesPage />)} path="finance/expenses" />
              <Route element={lazyPage(<AdminFinanceRecurringPage />)} path="finance/recurring" />
              <Route element={lazyPage(<AdminFinancePurchasesPage />)} path="finance/purchases" />
              <Route element={lazyPage(<AdminFinanceCashFlowPage />)} path="finance/cash-flow" />
              <Route element={lazyPage(<AdminFinanceProfitLossPage />)} path="finance/profit-loss" />
              <Route element={lazyPage(<AdminFinancePeriodsPage />)} path="finance/periods" />
              <Route element={lazyPage(<AdminFinancePeriodDetailPage />)} path="finance/periods/:periodId" />
              <Route element={lazyPage(<AdminFinancePlatformSharePage />)} path="finance/platform-share" />
              <Route element={lazyPage(<AdminFinanceSettingsPage />)} path="finance/settings" />
              <Route element={lazyPage(<AdminSettingsPage />)} path="settings" />
              </Route>
            </Route>
          </Route>

          <Route element={<RoleRoute allowedRoles={[USER_ROLES.employee]} />}>
            <Route element={<LegacyOrganizationRedirect area="employee" />} path="/employee/*" />
          </Route>

          <Route element={<OrganizationSlugRoute />}>
            <Route element={<RoleRoute allowedRoles={[USER_ROLES.platformOwner, USER_ROLES.employee]} />}>
              <Route element={<EmployeeLayout />} path="/:organizationSlug/employee">
              <Route element={lazyPage(<EmployeeWorkspacePage />)} index />
              <Route element={lazyPage(<EmployeeWorkspacePage />)} path="workspace" />
              <Route element={lazyPage(<EmployeeShiftPage />)} path="shift" />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route element={<NotFoundPage />} path="*" />
      </Routes>
    </BrowserRouter>
  )
}
