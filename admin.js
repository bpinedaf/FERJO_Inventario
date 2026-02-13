// =============================
// FERJO ADMIN.JS — versión blindada
// =============================

let ventaItems = [];
let compraItems = [];

let ventaSubmitting = false;
let compraSubmitting = false;
let pagoSubmitting = false;
let movimientoSubmitting = false;

// =============================
// Idempotencia - request_id único por operación
// =============================
function generateRequestId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'REQ-' + Date.now() + '-' + Math.floor(Math.random() * 1000000);
}


// =============================
// Helper API
// =============================
function apiUrl(path) {
  const base = (document.getElementById("apiUrl")?.value || "").replace(/\/+$/, "");
  return `${base}/exec?path=${path}`;
}

async function postData(path, data) {
  const token = window.getToken ? window.getToken() : "";
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, token })
  });
  return await res.json();
}

// =============================
// VENTAS
// =============================
const formVenta = document.getElementById("formVenta");
if (formVenta) {
  formVenta.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (ventaSubmitting) return;

    if (ventaItems.length === 0) {
      alert("Debe agregar al menos un producto.");
      return;
    }

    ventaSubmitting = true;
    const btn = document.getElementById("btnVentaRegistrar");
    btn.disabled = true;
    btn.textContent = "Registrando...";

    try {
      const formData = new FormData(formVenta);
      const payload = Object.fromEntries(formData.entries());
      payload.items = ventaItems;
      
      // 🔒 IDEMPOTENCIA
      payload.request_id = generateRequestId();

      const resp = await postData("sale_register", payload);

      document.getElementById("respVenta").textContent =
        JSON.stringify(resp, null, 2);

      if (resp.ok) {
        limpiarVenta();
      } else {
        alert("Error registrando venta.");
      }

    } catch (err) {
      console.error(err);
      alert("Error inesperado.");
    } finally {
      ventaSubmitting = false;
      btn.disabled = false;
      btn.textContent = "Registrar venta";
    }
  });
}

function limpiarVenta() {
  formVenta.reset();
  ventaItems = [];
  document.getElementById("ventaItemsBody").innerHTML = "";
  document.getElementById("ventaTotalBruto").textContent = "0.00";
  document.getElementById("ventaTotalDescuento").textContent = "0.00";
  document.getElementById("ventaTotalNeto").textContent = "0.00";
}

// =============================
// COMPRAS
// =============================
const formCompra = document.getElementById("formCompra");
if (formCompra) {
  formCompra.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (compraSubmitting) return;

    if (compraItems.length === 0) {
      alert("Debe agregar al menos un producto.");
      return;
    }

    compraSubmitting = true;
    const btn = document.getElementById("btnCompraRegistrar");
    btn.disabled = true;
    btn.textContent = "Registrando...";

    try {
      const formData = new FormData(formCompra);
      const payload = Object.fromEntries(formData.entries());
      payload.items = compraItems;

      // 🔒 IDEMPOTENCIA
      payload.request_id = generateRequestId();

      const resp = await postData("purchase_register", payload);

      document.getElementById("respCompra").textContent =
        JSON.stringify(resp, null, 2);

      if (resp.ok) {
        limpiarCompra();
      } else {
        alert("Error registrando compra.");
      }

    } catch (err) {
      console.error(err);
      alert("Error inesperado.");
    } finally {
      compraSubmitting = false;
      btn.disabled = false;
      btn.textContent = "Registrar compra";
    }
  });
}

function limpiarCompra() {
  formCompra.reset();
  compraItems = [];
  document.getElementById("compraItemsBody").innerHTML = "";
  document.getElementById("compraTotalNeto").textContent = "0.00";
}

// =============================
// AGREGAR ITEM A COMPRA
// =============================
document.getElementById("btnCompraAgregarItem")?.addEventListener("click", () => {
  const id = document.getElementById("compraCodigo").value.trim();
  const nombre = document.getElementById("compraNombre").value.trim();
  const costo = parseFloat(document.getElementById("compraCostoUnitario").value);
  const cantidad = parseInt(document.getElementById("compraCantidad").value);

  if (!id || !nombre || !costo || !cantidad) {
    alert("Complete todos los campos.");
    return;
  }

  compraItems.push({
    id_del_articulo: id,
    nombre,
    costo_unitario: costo,
    cantidad
  });

  renderCompraItems();
});

function renderCompraItems() {
  const tbody = document.getElementById("compraItemsBody");
  tbody.innerHTML = "";

  let total = 0;

  compraItems.forEach((item, index) => {
    const subtotal = item.costo_unitario * item.cantidad;
    total += subtotal;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.id_del_articulo}</td>
      <td>${item.nombre}</td>
      <td>${item.cantidad}</td>
      <td>${item.costo_unitario.toFixed(2)}</td>
      <td>${subtotal.toFixed(2)}</td>
      <td><button onclick="eliminarCompraItem(${index})">X</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("compraTotalNeto").textContent =
    total.toFixed(2);
}

function eliminarCompraItem(index) {
  compraItems.splice(index, 1);
  renderCompraItems();
}
