import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ClienteService } from '../../../core/services/cliente.service';
import { Cliente } from '../../../core/models/Cliente';
import { ProductoService } from '../../../core/services/producto.service';
import { Producto } from '../../../core/models/Producto';
import { Sucursal } from '../../../core/models/Sucursal';
import { SucursalService } from '../../../core/services/sucursal.service';
import { ComprobanteService } from '../../../core/services/comprobante.service';
import { Comprobante, DetalleComprobante, FormaPago }  from '../../../core/models/Comprobante';
import { formatDate } from '@angular/common';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-generar-venta',
  templateUrl: './generar-venta.component.html',
  styleUrls: ['./generar-venta.component.css']
})
export class GenerarVentaComponent implements OnInit {

  listaProductos: Producto[] = [];
  listaClientes: Cliente[] = [];
  listaSursales: Sucursal[] = [];

  filtroProductos: Producto[] = [];
  filtroCliente: Cliente[] = [];
  filtroSucursal: Sucursal[] = [];

  tipoDoc: string = '';
  cliente: string = '';
  producto: string = '';
  sucursal: string = '';
  tipoComprobante: string = '';

  selectedComprobante: string = ''; // POR DEFECTO
  selectedTipoDoc: string = '';

  selectFormaPago: string = 'Efectivo';
  selectedSucursal: string = '';
  selectedCliente: string = '';
  selectedProducto: string = '';

  stock: number = 0;
  cantidad: number = 1;

  productosSeleccionados: { producto: Producto, cantidad: number, valor: number, igv: number, precioConIgv: number }[] = [];
  totalGravada: number = 0;
  igv: number = 0;
  totalPagar: number = 0;

  // Define las opciones disponibles según el comprobante
  opcionesTipoDoc: { value: string, label: string }[] = [];

  constructor(
    private comprobanteService: ComprobanteService,
    private clienteService: ClienteService,
    private productoService: ProductoService,
    private sucursalService: SucursalService,
    private cdr: ChangeDetectorRef 
  ) {}

  ngOnInit() {
    this.cargarClientes();
    this.obtenerProductos();
    this.cargarSucursales();
    this.ElegirComprobante();
    //this.ElegirTipoDoc();
  
    const tipoComprobanteSelect = document.getElementById('tipoComprobante') as HTMLSelectElement;
    const serieInput = document.getElementById('serie') as HTMLInputElement;
  
    tipoComprobanteSelect.addEventListener('change', () => {
      this.selectedComprobante = tipoComprobanteSelect.value;
      if (this.selectedComprobante === 'boleta') {
        this.tipoDoc = '03';
        serieInput.value = 'B001';
      } else if (this.selectedComprobante === 'factura') {
        this.tipoDoc = '01';
        serieInput.value = 'F001';
      }
      // Recalcular totales cuando cambie el tipo de comprobante
      this.actualizarTotales();
    });
    serieInput.value = 'B001';  // Valor inicial

    // Configurar la fecha de emisión
    const fechaEmisionInput = document.getElementById('fechaEmision') as HTMLInputElement;
    const today = new Date().toISOString().split('T')[0];
    fechaEmisionInput.value = today;

    this.actualizarHoraEmision();

  }


  // ------------------------------------------------------
  ElegirComprobante() {
    
    if (this.selectedComprobante === 'factura') {
      // Filtrar solo clientes con RUC
      this.filtroCliente = this.listaClientes.filter(cliente => cliente.ruc_cliente != null && cliente.ruc_cliente !== '');
      this.opcionesTipoDoc = [{ value: '6', label: 'RUC' }];
      this.selectedTipoDoc = '6'; // Forzar automáticamente RUC
    } else if (this.selectedComprobante === 'boleta') {
      // Permitir tanto DNI como RUC
      this.filtroCliente = this.listaClientes;
      this.opcionesTipoDoc = [
        { value: '1', label: 'DNI' },
        { value: '6', label: 'RUC' }
      ];
      this.selectedTipoDoc = '1'; // ULTIMO MIERCOLES 20-11-2024
      // No cambiar el tipo de documento automáticamente
      if (!this.opcionesTipoDoc.some(doc => doc.value === this.selectedTipoDoc)) {
        this.selectedTipoDoc = ''; // Resetear si el tipo actual no es válido
      }
    }
    
    // Recalcular totales después de cambiar el tipo de comprobante
    this.actualizarTotales();
  }
  

  // ------------------------------------------------------
  emitirComprobante() {
    const clienteObj = this.listaClientes.find(cliente => cliente.id_cliente === parseInt(this.selectedCliente));
    const sucursalObj = this.listaSursales.find(sucursal => sucursal.id_sucursal === parseInt(this.selectedSucursal));
  
    if (!clienteObj) {
      alert('Por favor, selecciona un cliente válido');
      return; 
    }
    if (!sucursalObj) {
      alert('Por favor, selecciona una sucursal válida');
      return; 
    }

    // Validar coherencia entre Tipo de Comprobante y Tipo de Documento
    if (this.selectedComprobante === 'factura' && this.selectedTipoDoc !== '6') {
      alert('El tipo de documento debe ser RUC para emitir una Factura.');
      return;
    }

    // if (this.selectedComprobante === 'boleta' && !['1', '6'].includes(this.selectedTipoDoc)) {
    //   alert('El tipo de documento debe ser DNI o RUC para emitir una Boleta.');
    //   return;
    // }

    // Validar monto máximo para boleta
    if (this.selectedComprobante === 'boleta' && this.selectedTipoDoc === '6' && this.totalPagar > 700.00) {
      alert('El monto máximo permitido para una boleta con RUC es de 700.00.');
      return;
    }
  
    // Valida la selección del Tipo de Documento
    let clienteTipoDoc = null;
    if (this.selectedTipoDoc === '1') {
      clienteTipoDoc = '1'; // DNI
    } else if (this.selectedTipoDoc === '6') {
      clienteTipoDoc = '6'; // RUC
    }
    
    if (!clienteTipoDoc) {
      alert('Por favor, selecciona un tipo de documento válido para el cliente');
      return;
    }
  
    // Validar el monto máximo para boletas
    if (this.selectedComprobante === 'boleta' && this.totalPagar > 700.00) {
      alert('El monto máximo permitido para una boleta es de 700.00');
      return;
    }
  
    // Configurar los datos del comprobante
    const comprobanteData: Comprobante = {
      tipo_operacion: '0101',
      tipo_doc: this.tipoDoc,
      numero_serie: this.tipoDoc === '03' ? 'B001' : 'F001',
      tipo_moneda: 'PEN',
      fecha_emision: formatDate(new Date(), 'yyyy-MM-dd', 'en-US'),
      hora_emision: formatDate(new Date(), 'HH:mm:ss.SSS', 'en-US'),
      empresa_ruc: '20144109458',
      razon_social: 'Daryza S.A.C.',
      nombre_comercial: 'Daryza',
      urbanizacion: 'Lurin',
      distrito: 'Lurin',
      departamento: 'Lima',
      email_empresa: 'daryza@gmail.com',
      telefono_emp: '+51996638762',
      cliente_tipo_doc: clienteTipoDoc, 
      cliente: clienteObj.id_cliente,  
      sucursal: sucursalObj.id_sucursal,  
      detalle: this.productosSeleccionados.map(item => ({
        id_producto: item.producto.id_producto?.toString() || '',
        cantidad: item.cantidad
      })),           
      forma_pago: {
        tipo: this.selectFormaPago
      }

    };
  
    // Llamada al servicio para crear el comprobante
    this.comprobanteService.crearComprobante(comprobanteData).subscribe(

      response => {
        console.log('Comprobante registrado exitosamente:', response);
        Swal.fire({
          icon: 'success',
          title: '¡Éxito!',
          text: 'Comprobante registrado exitosamente',
          showCancelButton: true,
          confirmButtonText: 'Aceptar',
          cancelButtonText: 'Descargar PDF'
        }).then((result) => {
          if (result.dismiss === Swal.DismissReason.cancel) {
            // Descargar el PDF automáticamente
            if (response.id_comprobante !== undefined) {
              this.descargarPDF(response.id_comprobante);
            } else {
              console.error('El id_comprobante es undefined');
            }
          }
        });
        this.resetForm();
        this.actualizarHoraEmision();

        //this.ElegirTipoDoc();

        this.cargarSucursales(); // para manterner.
      },
      error => {
        console.error('Error al registrar el comprobante:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Error al registrar el comprobante',
          confirmButtonText: 'Aceptar'
        });
      }

    );

  }

  elegirSucursal() {
    this.sucursal = this.selectedSucursal;
  }

  // ------------------------------------------------------
  actualizarCantidad(index: number, cantidad: number) {
    const producto = this.productosSeleccionados[index];
    producto.cantidad = cantidad;
    producto.valor = producto.cantidad * producto.producto.precio_venta;
    
    // Aplicar IGV solo si es factura, 0.00 si es boleta
    if (this.selectedComprobante === 'factura') {
      producto.igv = producto.valor * 0.18;
      producto.precioConIgv = producto.valor + producto.igv;
    } else {
      // Para boleta: IGV = 0.00, precio con IGV = valor sin IGV
      producto.igv = 0.00;
      producto.precioConIgv = producto.valor;
    }
    
    this.actualizarTotales();
  }
  
  actualizarTotales() {
    this.totalGravada = this.calcularTotalGravada();
    this.igv = this.calcularIgv();
    this.totalPagar = this.calcularTotalPagar();
    this.cdr.detectChanges();
  }
  
  calcularTotalGravada(): number {
    return this.productosSeleccionados.reduce((total, item) => total + (item.valor || 0), 0); 
  }
  
  calcularIgv(): number {
    // Si es boleta, IGV siempre es 0.00
    if (this.selectedComprobante === 'boleta') {
      return 0.00;
    }
    // Si es factura, calcular IGV al 18%
    return this.productosSeleccionados.reduce((total, item) => total + (item.igv || 0), 0);  
  }
  
  calcularTotalPagar(): number {
    return this.productosSeleccionados.reduce((total, item) => total + (item.precioConIgv || 0), 0); 
  }
  
  eliminarProducto(index: number) {
    this.productosSeleccionados.splice(index, 1);
    this.actualizarTotales();
  }
  
  // ------------------------------------------------------
  cargarSucursales() {
    this.sucursalService.cargarSucursales().subscribe((data) => {
      this.listaSursales = data;
      this.filtroSucursal = data;
      
      // Establecer el primer ID de sucursal como valor predeterminado
      if (this.filtroSucursal.length > 0) {
        this.selectedSucursal = this.filtroSucursal[0].id_sucursal.toString();
      }
    });
  }
  

  ElegirCliente() {
    const clienteSeleccionado = this.listaClientes.find(cliente => cliente.id_cliente === Number(this.selectedCliente));
  
    if (clienteSeleccionado) {
      this.opcionesTipoDoc = [];
      
      // Agregar las opciones de documentos disponibles para el cliente
      if (clienteSeleccionado.dni_cliente) {
        this.opcionesTipoDoc.push({ value: '1', label: 'DNI' });
      }
      if (clienteSeleccionado.ruc_cliente) {
        this.opcionesTipoDoc.push({ value: '6', label: 'RUC' });
      }
  
      // Si hay solo una opción de tipo de documento, seleccionarla automáticamente
      if (this.opcionesTipoDoc.length === 1) {
        this.selectedTipoDoc = this.opcionesTipoDoc[0].value;
      }
  
      // Reglas específicas para Factura
      if (this.selectedComprobante === 'factura') {
        // Forzar que solo se vea el tipo RUC
        this.opcionesTipoDoc = [{ value: '6', label: 'RUC' }];
        this.selectedTipoDoc = '6';
      }
    }
  }
  cargarClientes() {
    this.clienteService.getClientes().subscribe((data) => {
      this.listaClientes = data;
      this.ElegirComprobante(); 
    });
  }
  // Método para buscar clientes
  buscarCliente(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const searchText = inputElement.value.toLowerCase();

    if (this.selectedComprobante === 'factura') {
      // Solo permite buscar clientes con RUC
      this.filtroCliente = this.listaClientes.filter(
        (pro) =>
          (pro.ruc_cliente?.toLowerCase().includes(searchText) || pro.nombre_clie.toLowerCase().includes(searchText)) &&
          pro.ruc_cliente != null,
          //this.ElegirComprobante() // NUEVO .------------------------------
      );
    } else {
      // Permite buscar todos los clientes si el comprobante es boleta
      this.filtroCliente = this.listaClientes.filter(
        (pro) =>
          (pro.dni_cliente?.toLowerCase().includes(searchText) || pro.nombre_clie.toLowerCase().includes(searchText))
      );
    }
    //this.ElegirComprobante(); 
  }

  // ------------------------------------------------------
  ElegirProducto() {
    const productoSeleccionado = this.listaProductos.find(
      (prod) => prod.id_producto === parseInt(this.selectedProducto)
    );
    if (productoSeleccionado) {
      this.stock = productoSeleccionado.estock;
      this.cdr.detectChanges(); 
    }
  }
  obtenerProductos() {
    this.productoService.getProductoLista().subscribe(
      (response: Producto[]) => {
        // Filtrar productos con estado_producto = true
        this.listaProductos = response.filter(producto => producto.estado);
        this.filtroProductos = this.listaProductos; // Puedes aplicar el filtro si lo necesitas
      },
      (error) => {
        console.error('Error al obtener los productos:', error);
      }
    );
  }

  anadirArticulo() {
    const productoSeleccionado = this.listaProductos.find(
      (prod) => prod.id_producto === parseInt(this.selectedProducto)
    );
    if (productoSeleccionado && !this.productosSeleccionados.find(p => p.producto.id_producto === productoSeleccionado.id_producto)) {
      
      let igvCalculado: number;
      let precioConIgvCalculado: number;
      const valorBase = productoSeleccionado.precio_venta * this.cantidad;
      
      // Aplicar lógica según tipo de comprobante
      if (this.selectedComprobante === 'factura') {
        // Para factura: aplicar IGV del 18%
        igvCalculado = valorBase * 0.18;
        precioConIgvCalculado = valorBase + igvCalculado;
      } else {
        // Para boleta: IGV = 0.00, precio con IGV = valor base
        igvCalculado = 0.00;
        precioConIgvCalculado = valorBase;
      }
      
      this.productosSeleccionados.push({
        producto: productoSeleccionado,
        cantidad: this.cantidad,
        valor: valorBase,
        igv: igvCalculado,
        precioConIgv: precioConIgvCalculado
      });
      
      this.actualizarTotales();
      this.cdr.detectChanges(); 
    }
  }
  removeProducto(item: Producto) {
    this.filtroProductos = this.filtroProductos.filter(prod => prod.id_producto !== item.id_producto);
  }
  buscarProducto(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const searchText = inputElement.value.toLowerCase();
    if (searchText) {
      this.filtroProductos = this.listaProductos.filter(
        (prod) =>
          prod.codigo.toLowerCase().includes(searchText) ||
          prod.nombre_prod.toLowerCase().includes(searchText)
      );
    } else {
      this.filtroProductos = this.listaProductos;
    }
  }

  // ------------------------------------------------------
  descargarPDF(id: number) {
    this.comprobanteService.obtenerComprobantePDF(id).subscribe(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobante_${id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  // ------------------------------------------------------
  // SECUNDARIO:

  actualizarCantidadInput() {
    this.cantidad = parseInt((<HTMLInputElement>document.getElementById('cantidad')).value, 10);
  }
  resetForm() {
    this.productosSeleccionados = [];
    this.totalGravada = 0;
    this.igv = 0;
    this.totalPagar = 0;
    this.cantidad = 1;

    this.tipoDoc = '';
    this.tipoComprobante = '';
    this.selectedComprobante = '';

    this.selectedProducto = '';
    this.selectedCliente = '';
    this.selectedSucursal = '';
    this.cdr.detectChanges();
  }

  actualizarHoraEmision() {
    const horaEmisionInput = document.getElementById('horaEmision') as HTMLInputElement;
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    horaEmisionInput.value = `${hours}:${minutes}`;
    this.cdr.detectChanges(); // Forzar la actualización de la vista
  }  

}