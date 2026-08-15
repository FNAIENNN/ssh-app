      {step === 1 && (
        <SeedVanPlanStep1
          vehicles={vehicles}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={setSelectedVehicleId}
          step1Data={getVehicleData(step1Data, selectedVehicleId)}
          onNext={handleStep1Next}
          activeOrder={orderBill}
          pendingOrders={pendingOrders}
          onSelectOrder={setActiveOrder}
        />
      )}

      {step === 2 && (
        <StockingStatusStep2
          vehicles={vehicles}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={setSelectedVehicleId}
          step2Data={step2Data?.[selectedVehicleId]}
          vanPlanData={step1Data?.[selectedVehicleId]}
          onNext={handleStep2Next}
          supervisorName={supervisorName}
          setSupervisorName={setSupervisorName}
          supervisorPhone={supervisorPhone}
          setSupervisorPhone={setSupervisorPhone}
          supervisorSignature={supervisorSignature}
          setSupervisorSignature={setSupervisorSignature}
          onCompleteAll={handleCompleteStockingStatus}
          submitting={loading}
        />
      )}

      {step === 3 && (
        <OutsideWorkersStep3
          initialStep3Data={step3Data}
          initialSupervisorName={supervisorName}
          initialSupervisorPhone={supervisorPhone}
          siteId={siteId}
          activeOrder={orderBill}
          onComplete={() => {
            toast.success('Seed Stocking fully completed!');
            onStockingCompleted?.();
          }}
          onBack={() => setStep(2)}
          onSaveState={setStep3Data}
        />
      )}