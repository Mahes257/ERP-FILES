package com.vishatech.erp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@SpringBootApplication
@EnableJpaAuditing
public class ErpApplication {

    public static void main(String[] args) {
        // One artifact, two processes: the CAD conversion worker runs in an
        // isolated process (no web layer, no port) so a heavy CAD engine can
        // never block ERP request threads. The default run is the normal ERP.
        if (com.vishatech.cadworker.CadWorkerApplication.isWorkerMode(args)) {
            com.vishatech.cadworker.CadWorkerApplication.main(args);
            return;
        }
        SpringApplication.run(ErpApplication.class, args);
    }
}
