/**
 * ProductionProviders — wraps all Production context providers into a single
 * component so routes stay clean.
 */
import { SalesOrdersProvider } from './context/SalesOrdersContext';
import { ProductionOrdersProvider } from './context/ProductionOrdersContext';
import { QualityProvider } from './context/QualityContext';
import { PackingProvider } from './context/PackingContext';
import { DispatchProvider } from './context/DispatchContext';
import { ProductionEntryProvider } from './context/ProductionEntryContext';
import { AcknowledgementProvider } from './context/AcknowledgementContext';
import { TechnicalVerificationProvider } from './context/TechnicalVerificationContext';
import { DrawingsProvider } from './context/DrawingsContext';
import { ModelsProvider } from './context/ModelsContext';
import { DashboardNavProvider } from './context/DashboardNavContext';

export default function ProductionProviders({ children }) {
  return (
    <SalesOrdersProvider>
      <ProductionOrdersProvider>
        <QualityProvider>
          <PackingProvider>
            <DispatchProvider>
              <ProductionEntryProvider>
                <AcknowledgementProvider>
                  <TechnicalVerificationProvider>
                    <DrawingsProvider>
                      <ModelsProvider>
                        <DashboardNavProvider>
                          {children}
                        </DashboardNavProvider>
                      </ModelsProvider>
                    </DrawingsProvider>
                  </TechnicalVerificationProvider>
                </AcknowledgementProvider>
              </ProductionEntryProvider>
            </DispatchProvider>
          </PackingProvider>
        </QualityProvider>
      </ProductionOrdersProvider>
    </SalesOrdersProvider>
  );
}
